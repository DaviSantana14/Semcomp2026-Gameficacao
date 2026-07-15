import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AuditEntityType,
  AuditOperation,
  AuditActorType,
} from '../audit/audit.repository';
import { AuditService } from '../audit/audit.service';
import { AdminOperationContext } from '../common/request-context';
import { PersistenceUniqueConstraintError } from '../common/persistence-errors';
import { paginate } from '../common/dto/pagination-response.dto';
import {
  AdminReconciliationRepository,
  PointEventKind,
  PointEventSource,
  ReconciliationCompensationEvent,
} from './admin-reconciliation.repository';
import { ConfirmReconciliationDto } from './dto/confirm-reconciliation.dto';
import {
  ListReconciliationDto,
  ReconciliationFilter,
} from './dto/list-reconciliation.dto';
import {
  ReconciliationResponseDto,
  ReconciliationStatus,
} from './dto/reconciliation-response.dto';

@Injectable()
export class AdminReconciliationService {
  constructor(
    private readonly repository: AdminReconciliationRepository,
    private readonly audit: AuditService,
  ) {}

  async confirm(
    participantId: string,
    dto: ConfirmReconciliationDto,
    context: AdminOperationContext,
  ) {
    const input = { ...dto, reason: dto.reason.trim() };
    try {
      return await this.repository.withTransaction(async (transaction) => {
        const reconciliation =
          await transaction.lockReconciliation(participantId);
        if (!reconciliation) {
          throw new NotFoundException('Participante não encontrado.');
        }
        const existing = await transaction.findByIdempotencyKey(
          input.idempotencyKey,
        );
        if (existing)
          return this.replay(existing, participantId, input, context);

        const before = reconciliationSnapshot(reconciliation);
        if (before.status === ReconciliationStatus.CONSISTENT) {
          throw new ConflictException('O participante já está reconciliado.');
        }

        const pointEventId = randomUUID();
        const pointsDelta = before.pointsDifference;
        const xpDelta = before.xpDifference;
        const kind = pointEventKind(pointsDelta, xpDelta);
        const after = {
          participantId,
          storedPoints: before.storedPoints,
          storedXp: before.storedXp,
          ledgerPoints: before.ledgerPoints + pointsDelta,
          ledgerXp: before.ledgerXp + xpDelta,
          pointsDifference: 0,
          xpDifference: 0,
          status: ReconciliationStatus.CONSISTENT,
        };
        const auditEvent = await this.audit.record(transaction.auditWriter, {
          actor: { actorType: AuditActorType.ADMIN, ...context },
          operation: AuditOperation.RECONCILIATION_ADJUSTMENT_CONFIRMED,
          entityType: AuditEntityType.RECONCILIATION,
          entityId: participantId,
          participantId,
          reason: input.reason,
          before,
          after: { ...after, pointEventId },
          metadata: { pointEventId },
        });
        const pointEvent = await transaction.createPointEvent({
          id: pointEventId,
          userId: participantId,
          points: pointsDelta,
          xpDelta,
          kind,
          source: PointEventSource.ADMIN_ADJUST,
          actorAdminId: context.actorAdminId,
          idempotencyKey: input.idempotencyKey,
          auditEventId: auditEvent.id,
          description: input.reason,
        });
        return confirmationResponse(
          before,
          after,
          pointEvent,
          auditEvent,
          false,
        );
      });
    } catch (error) {
      if (!(error instanceof PersistenceUniqueConstraintError)) throw error;
      const winner = await this.repository.findByIdempotencyKey(
        input.idempotencyKey,
      );
      if (!winner) throw error;
      return this.replay(winner, participantId, input, context);
    }
  }

  async findAll(query: ListReconciliationDto) {
    const { rows, total } = await this.repository.findPage({
      page: query.page,
      limit: query.limit,
      search: query.search || undefined,
      divergentOnly: query.filter === ReconciliationFilter.DIVERGENT,
    });
    return paginate(
      rows.map((row) => this.serialize(row)),
      total,
      query.page,
      query.limit,
    );
  }

  async findOne(id: string) {
    const row = await this.repository.findByParticipantId(id);
    if (!row) throw new NotFoundException('Participante não encontrado.');
    return this.serialize(row);
  }

  async getSummary() {
    return {
      divergentParticipants: await this.repository.countDivergent(),
    };
  }

  private serialize(row: {
    participantId: string;
    name: string;
    email: string;
    storedPoints: number;
    storedXp: number;
    ledgerPoints: number;
    ledgerXp: number;
    lastEventAt: Date | null;
  }): ReconciliationResponseDto {
    const pointsDifference = row.storedPoints - row.ledgerPoints;
    const xpDifference = row.storedXp - row.ledgerXp;
    return {
      ...row,
      pointsDifference,
      xpDifference,
      status:
        pointsDifference === 0 && xpDifference === 0
          ? ReconciliationStatus.CONSISTENT
          : ReconciliationStatus.DIVERGENT,
      lastEventAt: row.lastEventAt?.toISOString() ?? null,
    };
  }

  private replay(
    event: ReconciliationCompensationEvent,
    participantId: string,
    input: ConfirmReconciliationDto,
    context: AdminOperationContext,
  ) {
    const auditEvent = event.auditEvent;
    const identical =
      auditEvent?.operation ===
        AuditOperation.RECONCILIATION_ADJUSTMENT_CONFIRMED &&
      event.userId === participantId &&
      event.source === PointEventSource.ADMIN_ADJUST &&
      event.description === input.reason &&
      auditEvent.reason === input.reason &&
      event.actorAdminId === context.actorAdminId;
    if (!identical || !auditEvent) {
      throw new ConflictException(
        'A chave de idempotência já foi usada com conteúdo diferente.',
      );
    }
    const before = readReconciliationSnapshot(auditEvent.before);
    const after = readReconciliationSnapshot(auditEvent.after);
    if (
      event.points !== before.pointsDifference ||
      event.xpDelta !== before.xpDifference
    ) {
      throw new ConflictException(
        'A chave de idempotência já foi usada com conteúdo diferente.',
      );
    }
    return confirmationResponse(before, after, event, auditEvent, true);
  }
}

type ReconciliationSnapshot = {
  participantId: string;
  storedPoints: number;
  storedXp: number;
  ledgerPoints: number;
  ledgerXp: number;
  pointsDifference: number;
  xpDifference: number;
  status: ReconciliationStatus;
};

function reconciliationSnapshot(row: {
  participantId: string;
  storedPoints: number;
  storedXp: number;
  ledgerPoints: number;
  ledgerXp: number;
}): ReconciliationSnapshot {
  const pointsDifference = row.storedPoints - row.ledgerPoints;
  const xpDifference = row.storedXp - row.ledgerXp;
  return {
    participantId: row.participantId,
    storedPoints: row.storedPoints,
    storedXp: row.storedXp,
    ledgerPoints: row.ledgerPoints,
    ledgerXp: row.ledgerXp,
    pointsDifference,
    xpDifference,
    status:
      pointsDifference === 0 && xpDifference === 0
        ? ReconciliationStatus.CONSISTENT
        : ReconciliationStatus.DIVERGENT,
  };
}

function pointEventKind(pointsDelta: number, xpDelta: number) {
  const direction = pointsDelta === 0 ? xpDelta : pointsDelta;
  return direction < 0 ? PointEventKind.DEBIT : PointEventKind.CREDIT;
}

function readReconciliationSnapshot(value: unknown): ReconciliationSnapshot {
  if (!value || typeof value !== 'object')
    throw new ConflictException('Registro idempotente inválido.');
  const snapshot = value as Record<string, unknown>;
  const numeric = [
    'storedPoints',
    'storedXp',
    'ledgerPoints',
    'ledgerXp',
    'pointsDifference',
    'xpDifference',
  ];
  if (
    typeof snapshot.participantId !== 'string' ||
    numeric.some((field) => typeof snapshot[field] !== 'number')
  ) {
    throw new ConflictException('Registro idempotente inválido.');
  }
  return {
    participantId: snapshot.participantId,
    storedPoints: snapshot.storedPoints as number,
    storedXp: snapshot.storedXp as number,
    ledgerPoints: snapshot.ledgerPoints as number,
    ledgerXp: snapshot.ledgerXp as number,
    pointsDifference: snapshot.pointsDifference as number,
    xpDifference: snapshot.xpDifference as number,
    status:
      snapshot.pointsDifference === 0 && snapshot.xpDifference === 0
        ? ReconciliationStatus.CONSISTENT
        : ReconciliationStatus.DIVERGENT,
  };
}

function confirmationResponse(
  before: ReconciliationSnapshot,
  after: ReconciliationSnapshot,
  event: ReconciliationCompensationEvent,
  auditEvent: {
    id: string;
    operation: AuditOperation;
    requestId: string;
    createdAt: Date;
  },
  replayed: boolean,
) {
  return {
    before,
    after,
    pointEvent: {
      id: event.id,
      pointsDelta: event.points,
      xpDelta: event.xpDelta,
      kind: event.kind,
      source: event.source,
      origin: 'RECONCILIATION_COMPENSATION' as const,
      createdAt: event.createdAt.toISOString(),
    },
    auditEvent: {
      id: auditEvent.id,
      operation: auditEvent.operation,
      requestId: auditEvent.requestId,
      createdAt: auditEvent.createdAt.toISOString(),
    },
    replayed,
  };
}
