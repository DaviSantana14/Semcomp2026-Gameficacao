import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AuditActorType,
  AuditEntityType,
  AuditOperation,
} from '../audit/audit.repository';
import { AuditService } from '../audit/audit.service';
import { AdminOperationContext } from '../common/request-context';
import { PersistenceUniqueConstraintError } from '../common/persistence-errors';
import {
  AdminAdjustmentsRepository,
  IdempotentAdjustmentEvent,
  PointEventKind,
  PointEventSource,
} from './admin-adjustments.repository';
import { CreateParticipantAdjustmentDto } from './dto/create-participant-adjustment.dto';

const IDEMPOTENCY_CONFLICT =
  'A chave de idempotência já foi usada com conteúdo diferente.';

@Injectable()
export class AdminAdjustmentsService {
  constructor(
    private readonly repository: AdminAdjustmentsRepository,
    private readonly audit: AuditService,
  ) {}

  async adjust(
    participantId: string,
    dto: CreateParticipantAdjustmentDto,
    context: AdminOperationContext,
  ) {
    const input = { ...dto, reason: dto.reason.trim() };
    try {
      return await this.repository.withTransaction(async (transaction) => {
        const participant = await transaction.lockParticipant(participantId);
        if (!participant) {
          throw new NotFoundException('Participante não encontrado.');
        }

        const existing = await transaction.findByIdempotencyKey(
          input.idempotencyKey,
        );
        if (existing) {
          return this.replay(existing, participantId, input, context);
        }

        const points = participant.points + input.pointsDelta;
        const xp = participant.xp + input.xpDelta;
        if (points < 0 || xp < 0) {
          throw new BadRequestException(
            'O ajuste não pode deixar pontos ou XP negativos.',
          );
        }

        const pointEventId = randomUUID();
        const kind =
          input.pointsDelta < 0 || input.xpDelta < 0
            ? PointEventKind.DEBIT
            : PointEventKind.CREDIT;
        const source =
          kind === PointEventKind.CREDIT
            ? PointEventSource.ADMIN_GRANT
            : PointEventSource.ADMIN_ADJUST;
        const updated = await transaction.updateParticipantBalance(
          participantId,
          input.pointsDelta,
          input.xpDelta,
        );
        const auditEvent = await this.audit.record(transaction.auditWriter, {
          actor: { actorType: AuditActorType.ADMIN, ...context },
          operation: AuditOperation.PARTICIPANT_BALANCE_ADJUSTED,
          entityType: AuditEntityType.POINT_EVENT,
          entityId: pointEventId,
          participantId,
          reason: input.reason,
          before: {
            participantId,
            points: participant.points,
            xp: participant.xp,
            role: participant.role,
            isActive: participant.isActive,
          },
          after: {
            participantId,
            points,
            xp,
            role: participant.role,
            isActive: participant.isActive,
            pointEventId,
          },
          metadata: { pointEventId },
        });
        const pointEvent = await transaction.createPointEvent({
          id: pointEventId,
          userId: participantId,
          points: input.pointsDelta,
          xpDelta: input.xpDelta,
          kind,
          source,
          actorAdminId: context.actorAdminId,
          idempotencyKey: input.idempotencyKey,
          auditEventId: auditEvent.id,
          description: input.reason,
        });
        return {
          before: { points: participant.points, xp: participant.xp },
          after: { points: updated.points, xp: updated.xp },
          pointEvent: mapPointEvent(pointEvent),
          auditEvent: mapAuditEvent(auditEvent),
          replayed: false,
        };
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

  private replay(
    event: IdempotentAdjustmentEvent,
    participantId: string,
    input: CreateParticipantAdjustmentDto,
    context: AdminOperationContext,
  ) {
    const identical =
      event.auditEvent?.operation ===
        AuditOperation.PARTICIPANT_BALANCE_ADJUSTED &&
      event.userId === participantId &&
      event.points === input.pointsDelta &&
      event.xpDelta === input.xpDelta &&
      event.description === input.reason.trim() &&
      event.auditEvent.reason === input.reason.trim() &&
      event.actorAdminId === context.actorAdminId;
    if (!identical || !event.auditEvent) {
      throw new ConflictException(IDEMPOTENCY_CONFLICT);
    }
    const before = readBalance(event.auditEvent.before);
    const after = readBalance(event.auditEvent.after);
    return {
      before,
      after,
      pointEvent: mapPointEvent(event),
      auditEvent: mapAuditEvent(event.auditEvent),
      replayed: true,
    };
  }
}

function readBalance(value: unknown) {
  if (!value || typeof value !== 'object') {
    throw new ConflictException(IDEMPOTENCY_CONFLICT);
  }
  const snapshot = value as { points?: unknown; xp?: unknown };
  if (typeof snapshot.points !== 'number' || typeof snapshot.xp !== 'number') {
    throw new ConflictException(IDEMPOTENCY_CONFLICT);
  }
  return { points: snapshot.points, xp: snapshot.xp };
}

function mapPointEvent(event: IdempotentAdjustmentEvent) {
  return {
    id: event.id,
    pointsDelta: event.points,
    xpDelta: event.xpDelta,
    kind: event.kind,
    source: event.source,
    createdAt: event.createdAt.toISOString(),
  };
}

function mapAuditEvent(event: {
  id: string;
  operation: AuditOperation;
  requestId: string;
  createdAt: Date;
}) {
  return {
    id: event.id,
    operation: event.operation,
    requestId: event.requestId,
    createdAt: event.createdAt.toISOString(),
  };
}
