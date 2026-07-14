import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AuditActorType,
  AuditEntityType,
  AuditJsonValue,
  AuditOperation,
} from './audit.repository';
import { paginate } from '../common/dto/pagination-response.dto';
import { AuditRepository, TransactionAuditWriter } from './audit.repository';
import {
  ListAuditEventsDto,
  ListParticipantAuditEventsDto,
} from './dto/list-audit-events.dto';

export type AdminAuditActor = {
  actorType: typeof AuditActorType.ADMIN;
  actorAdminId: string;
  requestId: string;
};

export type SystemAuditActor = {
  actorType: typeof AuditActorType.SYSTEM;
  actorAdminId?: never;
  requestId: string;
};

export interface ParticipantStatusSnapshot {
  isActive: boolean;
}

export interface ActionAuditSnapshot {
  id: string;
  name: string;
  description: string | null;
  type: string;
  points: number;
  isActive: boolean;
  isCodeActive: boolean;
}

export interface ClaimCodeBatchSnapshot {
  quantity: number;
  type: string;
  actionId: string;
}

export interface ClaimCodeSnapshotSource {
  id: string;
  isActive: boolean;
  isUsed: boolean;
  code: string;
}

export interface RewardAuditSnapshot {
  id: string;
  name: string;
  description: string | null;
  costInPoints: number;
  stock: number;
  isActive: boolean;
}

export interface RedemptionAuditSnapshot {
  id: string;
  status: string;
  deliveredAt?: Date | string | null;
  cancelledAt?: Date | string | null;
  deliveredByAdminId?: string | null;
  cancelledByAdminId?: string | null;
  stock?: number;
  points?: number;
}

export interface BalanceAuditSnapshot {
  participantId: string;
  points: number;
  xp: number;
  pointEventId?: string;
  originalPointEventId?: string;
}

export type AuditSnapshotSource =
  | ParticipantStatusSnapshot
  | ActionAuditSnapshot
  | ClaimCodeBatchSnapshot
  | ClaimCodeSnapshotSource
  | RewardAuditSnapshot
  | RedemptionAuditSnapshot
  | BalanceAuditSnapshot;

export interface AuditMetadataSource {
  actionId?: string;
  batchSize?: number;
  claimCodeIds?: string[];
  pointEventId?: string;
  originalPointEventId?: string;
  reversalPointEventId?: string;
  rewardRedemptionId?: string;
}

export interface RecordAuditEventInput {
  actor: AdminAuditActor | SystemAuditActor;
  participantId?: string;
  operation: AuditOperation;
  entityType: AuditEntityType;
  entityId: string;
  reason: string;
  before?: AuditSnapshotSource | null;
  after?: AuditSnapshotSource | null;
  metadata?: AuditMetadataSource | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  async record(writer: TransactionAuditWriter, input: RecordAuditEventInput) {
    this.validateContext(input);
    const reason = input.reason.trim();
    if (reason.length < 10 || reason.length > 500) {
      throw new BadRequestException(
        'O motivo deve ter entre 10 e 500 caracteres.',
      );
    }

    return await writer.create({
      actorType: input.actor.actorType,
      actorAdminId:
        input.actor.actorType === AuditActorType.ADMIN
          ? (input.actor.actorAdminId ?? null)
          : null,
      participantId: input.participantId ?? null,
      operation: input.operation,
      entityType: input.entityType,
      entityId: input.entityId,
      reason,
      before: this.sanitizeSnapshot(input.operation, input.before),
      after: this.sanitizeSnapshot(input.operation, input.after),
      metadata: this.sanitizeMetadata(input.metadata),
      requestId: input.actor.requestId,
    });
  }

  listGlobal(query: ListAuditEventsDto) {
    return this.list(query);
  }

  listParticipant(participantId: string, query: ListParticipantAuditEventsDto) {
    return this.list({ ...query, participantId });
  }

  private async list(query: ListAuditEventsDto) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from > to) {
      throw new BadRequestException('O intervalo de datas é inválido.');
    }
    const page = await this.repository.findPage({
      page: query.page,
      limit: query.limit,
      actorType: query.actorType,
      actorAdminId: query.actorAdminId,
      operation: query.operation,
      entityType: query.entityType,
      entityId: query.entityId,
      participantId: query.participantId,
      requestId: query.requestId,
      from,
      to,
    });
    return paginate(
      page.rows.map((event) => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
      })),
      page.total,
      query.page,
      query.limit,
    );
  }

  private validateContext(input: RecordAuditEventInput) {
    const { actor } = input;
    const validRequestId =
      typeof actor.requestId === 'string' && actor.requestId.trim().length > 0;
    const validEntity =
      typeof input.entityId === 'string' && input.entityId.trim().length > 0;
    const validParticipant =
      input.participantId === undefined ||
      (typeof input.participantId === 'string' &&
        input.participantId.trim().length > 0);
    const validActor =
      (actor.actorType === AuditActorType.ADMIN &&
        typeof actor.actorAdminId === 'string' &&
        actor.actorAdminId.trim().length > 0) ||
      (actor.actorType === AuditActorType.SYSTEM &&
        !('actorAdminId' in actor) &&
        actor.actorAdminId === undefined);
    if (!validRequestId || !validEntity || !validParticipant || !validActor) {
      throw new BadRequestException('Contexto de auditoria incompleto.');
    }
  }

  private sanitizeSnapshot(
    operation: AuditOperation,
    source: AuditSnapshotSource | null | undefined,
  ): AuditJsonValue | undefined {
    if (source === null || source === undefined) return undefined;
    const value = source as unknown as Record<string, unknown>;
    switch (operation) {
      case AuditOperation.PARTICIPANT_STATUS_CHANGED:
        return pickScalarFields(value, ['isActive']);
      case AuditOperation.ACTION_STATUS_CHANGED:
      case AuditOperation.REWARD_STATUS_CHANGED:
        return pickScalarFields(value, ['id', 'isActive']);
      case AuditOperation.ACTION_CREATED:
      case AuditOperation.ACTION_UPDATED:
        return pickScalarFields(value, [
          'id',
          'name',
          'description',
          'type',
          'points',
          'isActive',
          'isCodeActive',
        ]);
      case AuditOperation.CLAIM_CODE_BATCH_GENERATED:
        return pickScalarFields(value, ['quantity', 'type', 'actionId']);
      case AuditOperation.CLAIM_CODE_STATUS_CHANGED: {
        const safe = pickScalarFields(value, ['id', 'isActive', 'isUsed']);
        if (typeof value.code === 'string') {
          safe.maskedCode = maskCode(value.code);
        }
        return safe;
      }
      case AuditOperation.REWARD_CREATED:
      case AuditOperation.REWARD_UPDATED:
        return pickScalarFields(value, [
          'id',
          'name',
          'description',
          'costInPoints',
          'stock',
          'isActive',
        ]);
      case AuditOperation.REWARD_REDEMPTION_DELIVERED:
      case AuditOperation.REWARD_REDEMPTION_CANCELLED:
        return pickScalarFields(value, [
          'id',
          'status',
          'deliveredAt',
          'cancelledAt',
          'deliveredByAdminId',
          'cancelledByAdminId',
          'stock',
          'points',
        ]);
      case AuditOperation.PARTICIPANT_BALANCE_ADJUSTED:
      case AuditOperation.PARTICIPANT_BALANCE_ADJUSTMENT_REVERSED:
      case AuditOperation.RECONCILIATION_ADJUSTMENT_CONFIRMED:
        return pickScalarFields(value, [
          'participantId',
          'points',
          'xp',
          'pointEventId',
          'originalPointEventId',
        ]);
    }
  }

  private sanitizeMetadata(
    source: AuditMetadataSource | null | undefined,
  ): AuditJsonValue | undefined {
    if (source === null || source === undefined) return undefined;
    const value = source as unknown as Record<string, unknown>;
    const safe = pickScalarFields(value, [
      'actionId',
      'batchSize',
      'pointEventId',
      'originalPointEventId',
      'reversalPointEventId',
      'rewardRedemptionId',
    ]);
    if (
      Array.isArray(value.claimCodeIds) &&
      value.claimCodeIds.every((item) => typeof item === 'string')
    ) {
      safe.claimCodeIds = value.claimCodeIds;
    }
    return safe;
  }
}

function pickScalarFields(source: Record<string, unknown>, keys: string[]) {
  const result: Record<string, string | number | boolean | null | string[]> =
    {};
  for (const key of keys) {
    const value = source[key];
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      result[key] = value;
    } else if (value instanceof Date) {
      result[key] = value.toISOString();
    }
  }
  return result;
}

function maskCode(code: string) {
  if (code.length <= 4) return '*'.repeat(code.length);
  return `${code.slice(0, 2)}${'*'.repeat(code.length - 4)}${code.slice(-2)}`;
}
