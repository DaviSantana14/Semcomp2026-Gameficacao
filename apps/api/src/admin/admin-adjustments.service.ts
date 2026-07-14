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
import { ReversePointEventDto } from './dto/reverse-point-event.dto';

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

  async reverse(
    originalId: string,
    dto: ReversePointEventDto,
    context: AdminOperationContext,
  ) {
    const input = { ...dto, reason: dto.reason.trim() };
    try {
      return await this.repository.withTransaction(async (transaction) => {
        const original = await transaction.lockPointEvent(originalId);
        if (!original) {
          throw new NotFoundException('Evento de pontos não encontrado.');
        }
        if (!isEligibleOriginal(original)) {
          throw new ConflictException(
            'O evento informado não é um ajuste administrativo elegível.',
          );
        }

        const existing = await transaction.findByIdempotencyKey(
          input.idempotencyKey,
        );
        if (existing) {
          return this.replayReversal(existing, originalId, input, context);
        }
        if (original.reversal) {
          throw new ConflictException(
            'Este ajuste administrativo já foi estornado.',
          );
        }

        const participant = await transaction.lockParticipant(original.userId);
        if (!participant) {
          throw new NotFoundException('Participante não encontrado.');
        }
        const pointsDelta = -original.points;
        const xpDelta = -original.xpDelta;
        const points = participant.points + pointsDelta;
        const xp = participant.xp + xpDelta;
        if (points < 0 || xp < 0) {
          throw new BadRequestException(
            'O estorno não pode deixar pontos ou XP negativos.',
          );
        }

        const pointEventId = randomUUID();
        const kind =
          pointsDelta < 0 || xpDelta < 0
            ? PointEventKind.DEBIT
            : PointEventKind.CREDIT;
        const updated = await transaction.updateParticipantBalance(
          participant.id,
          pointsDelta,
          xpDelta,
        );
        const auditEvent = await this.audit.record(transaction.auditWriter, {
          actor: { actorType: AuditActorType.ADMIN, ...context },
          operation: AuditOperation.PARTICIPANT_BALANCE_ADJUSTMENT_REVERSED,
          entityType: AuditEntityType.POINT_EVENT,
          entityId: pointEventId,
          participantId: participant.id,
          reason: input.reason,
          before: {
            participantId: participant.id,
            points: participant.points,
            xp: participant.xp,
            originalPointEventId: original.id,
          },
          after: {
            participantId: participant.id,
            points,
            xp,
            pointEventId,
            originalPointEventId: original.id,
          },
          metadata: {
            originalPointEventId: original.id,
            reversalPointEventId: pointEventId,
          },
        });
        const pointEvent = await transaction.createPointEvent({
          id: pointEventId,
          userId: participant.id,
          points: pointsDelta,
          xpDelta,
          kind,
          source: PointEventSource.ADMIN_ADJUST,
          actorAdminId: context.actorAdminId,
          idempotencyKey: input.idempotencyKey,
          auditEventId: auditEvent.id,
          reversedEventId: original.id,
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
      if (winner) {
        return this.replayReversal(winner, originalId, input, context);
      }
      if (await this.repository.findReversalByOriginalId(originalId)) {
        throw new ConflictException(
          'Este ajuste administrativo já foi estornado.',
        );
      }
      throw error;
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

  private replayReversal(
    event: IdempotentAdjustmentEvent,
    originalId: string,
    input: ReversePointEventDto,
    context: AdminOperationContext,
  ) {
    const identical =
      event.auditEvent?.operation ===
        AuditOperation.PARTICIPANT_BALANCE_ADJUSTMENT_REVERSED &&
      event.reversedEventId === originalId &&
      event.description === input.reason.trim() &&
      event.auditEvent.reason === input.reason.trim() &&
      event.actorAdminId === context.actorAdminId;
    if (!identical || !event.auditEvent) {
      throw new ConflictException(IDEMPOTENCY_CONFLICT);
    }
    return {
      before: readBalance(event.auditEvent.before),
      after: readBalance(event.auditEvent.after),
      pointEvent: mapPointEvent(event),
      auditEvent: mapAuditEvent(event.auditEvent),
      replayed: true,
    };
  }
}

function isEligibleOriginal(event: IdempotentAdjustmentEvent) {
  return (
    event.reversedEventId === null &&
    event.actorAdminId !== null &&
    (event.source === PointEventSource.ADMIN_GRANT ||
      event.source === PointEventSource.ADMIN_ADJUST) &&
    event.auditEvent?.operation === AuditOperation.PARTICIPANT_BALANCE_ADJUSTED
  );
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
    reversalOfPointEventId: event.reversedEventId,
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
