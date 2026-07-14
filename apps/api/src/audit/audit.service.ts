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
  id: string;
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
  pointEventId?: string;
}

export interface RedemptionDeliveryBeforeSnapshot {
  id: string;
  status: string;
  deliveredAt: Date | string | null;
  deliveredByAdminId: string | null;
}

export interface RedemptionDeliveryAfterSnapshot {
  id: string;
  status: string;
  deliveredAt: Date | string;
  deliveredByAdminId: string;
}

export interface RedemptionCancellationBeforeSnapshot {
  id: string;
  status: string;
  stock: number;
  points: number;
}

export interface RedemptionCancellationAfterSnapshot extends RedemptionCancellationBeforeSnapshot {
  cancelledAt: Date | string;
  cancelledByAdminId: string;
  pointEventId: string;
}

export interface BalanceAuditSnapshot {
  participantId: string;
  points: number;
  xp: number;
  role?: string;
  isActive?: boolean;
  pointEventId?: string;
  originalPointEventId?: string;
}

export interface AuditMetadataSource {
  actionId?: string;
  batchSize?: number;
  claimCodeIds?: string[];
  pointEventId?: string;
  originalPointEventId?: string;
  reversalPointEventId?: string;
  rewardRedemptionId?: string;
}

interface AuditEventBase<
  Operation extends AuditOperation,
  EntityType extends AuditEntityType,
> {
  actor: AdminAuditActor | SystemAuditActor;
  operation: Operation;
  entityType: EntityType;
  entityId: string;
  reason: string;
}

type RequiredParticipant = { participantId: string };
type OptionalParticipant = { participantId?: string };
type ForbiddenParticipant = { participantId?: never };
type NoMetadata = { metadata?: never };

type CreatedEvent<
  Operation extends AuditOperation,
  EntityType extends AuditEntityType,
  Snapshot,
  Participant = ForbiddenParticipant,
  Metadata = NoMetadata,
> = AuditEventBase<Operation, EntityType> &
  Participant & {
    before?: null;
    after: Snapshot;
  } & Metadata;

type ChangedEvent<
  Operation extends AuditOperation,
  EntityType extends AuditEntityType,
  Snapshot,
  Participant = ForbiddenParticipant,
  Metadata = NoMetadata,
> = AuditEventBase<Operation, EntityType> &
  Participant & {
    before: Snapshot;
    after: Snapshot;
  } & Metadata;

type BatchMetadata = {
  metadata?: Pick<
    AuditMetadataSource,
    'actionId' | 'batchSize' | 'claimCodeIds'
  >;
};

type BalanceMetadata = {
  metadata?: Pick<
    AuditMetadataSource,
    'pointEventId' | 'originalPointEventId' | 'reversalPointEventId'
  >;
};

type RedemptionMetadata = {
  metadata?: Pick<AuditMetadataSource, 'rewardRedemptionId'>;
};

type RedemptionCancellationMetadata = {
  metadata?: Pick<AuditMetadataSource, 'rewardRedemptionId' | 'pointEventId'>;
};

export type RecordAuditEventInput =
  | ChangedEvent<
      typeof AuditOperation.PARTICIPANT_STATUS_CHANGED,
      typeof AuditEntityType.PARTICIPANT,
      ParticipantStatusSnapshot,
      RequiredParticipant
    >
  | CreatedEvent<
      typeof AuditOperation.ACTION_CREATED,
      typeof AuditEntityType.ACTION,
      ActionAuditSnapshot
    >
  | ChangedEvent<
      typeof AuditOperation.ACTION_UPDATED,
      typeof AuditEntityType.ACTION,
      ActionAuditSnapshot
    >
  | ChangedEvent<
      typeof AuditOperation.ACTION_STATUS_CHANGED,
      typeof AuditEntityType.ACTION,
      Pick<ActionAuditSnapshot, 'isActive'>
    >
  | CreatedEvent<
      typeof AuditOperation.CLAIM_CODE_BATCH_GENERATED,
      typeof AuditEntityType.CLAIM_CODE_BATCH,
      ClaimCodeBatchSnapshot,
      ForbiddenParticipant,
      BatchMetadata
    >
  | ChangedEvent<
      typeof AuditOperation.CLAIM_CODE_STATUS_CHANGED,
      typeof AuditEntityType.CLAIM_CODE,
      ClaimCodeSnapshotSource,
      OptionalParticipant
    >
  | CreatedEvent<
      typeof AuditOperation.REWARD_CREATED,
      typeof AuditEntityType.REWARD,
      RewardAuditSnapshot
    >
  | ChangedEvent<
      typeof AuditOperation.REWARD_UPDATED,
      typeof AuditEntityType.REWARD,
      RewardAuditSnapshot
    >
  | ChangedEvent<
      typeof AuditOperation.REWARD_STATUS_CHANGED,
      typeof AuditEntityType.REWARD,
      Pick<RewardAuditSnapshot, 'isActive'>
    >
  | (AuditEventBase<
      typeof AuditOperation.REWARD_REDEMPTION_DELIVERED,
      typeof AuditEntityType.REWARD_REDEMPTION
    > &
      RequiredParticipant & {
        before: RedemptionDeliveryBeforeSnapshot;
        after: RedemptionDeliveryAfterSnapshot;
      } & RedemptionMetadata)
  | (AuditEventBase<
      typeof AuditOperation.REWARD_REDEMPTION_CANCELLED,
      typeof AuditEntityType.REWARD_REDEMPTION
    > &
      RequiredParticipant & {
        before: RedemptionCancellationBeforeSnapshot;
        after: RedemptionCancellationAfterSnapshot;
      } & RedemptionCancellationMetadata)
  | (AuditEventBase<
      typeof AuditOperation.PARTICIPANT_BALANCE_ADJUSTED,
      typeof AuditEntityType.POINT_EVENT
    > &
      RequiredParticipant & {
        before: Pick<
          BalanceAuditSnapshot,
          'participantId' | 'points' | 'xp' | 'role' | 'isActive'
        > & { role: string; isActive: boolean };
        after: Pick<
          BalanceAuditSnapshot,
          | 'participantId'
          | 'points'
          | 'xp'
          | 'role'
          | 'isActive'
          | 'pointEventId'
        > & { role: string; isActive: boolean; pointEventId: string };
        metadata?: Pick<AuditMetadataSource, 'pointEventId'>;
      })
  | (AuditEventBase<
      typeof AuditOperation.PARTICIPANT_BALANCE_ADJUSTMENT_REVERSED,
      typeof AuditEntityType.POINT_EVENT
    > &
      RequiredParticipant & {
        before: Pick<
          BalanceAuditSnapshot,
          'participantId' | 'points' | 'xp' | 'originalPointEventId'
        > & { originalPointEventId: string };
        after: Pick<
          BalanceAuditSnapshot,
          | 'participantId'
          | 'points'
          | 'xp'
          | 'pointEventId'
          | 'originalPointEventId'
        > & { pointEventId: string; originalPointEventId: string };
        metadata?: Pick<
          AuditMetadataSource,
          'originalPointEventId' | 'reversalPointEventId'
        >;
      })
  | ChangedEvent<
      typeof AuditOperation.RECONCILIATION_ADJUSTMENT_CONFIRMED,
      typeof AuditEntityType.RECONCILIATION,
      BalanceAuditSnapshot,
      RequiredParticipant,
      BalanceMetadata
    >;

type FieldKind =
  | 'boolean'
  | 'number'
  | 'string'
  | 'stringArray'
  | 'date'
  | 'nullableString'
  | 'nullableDate';

interface ObjectRule {
  required: Record<string, FieldKind>;
  optional?: Record<string, FieldKind>;
}

interface OperationRule {
  entityType: AuditEntityType;
  participant: 'required' | 'optional' | 'forbidden';
  before?: ObjectRule;
  after?: ObjectRule;
  metadata?: ObjectRule;
}

const participantStatusRule: ObjectRule = {
  required: { id: 'string', isActive: 'boolean' },
};
const actionRule: ObjectRule = {
  required: {
    id: 'string',
    name: 'string',
    description: 'nullableString',
    type: 'string',
    points: 'number',
    isActive: 'boolean',
    isCodeActive: 'boolean',
  },
};
const activeEntityRule: ObjectRule = {
  required: { isActive: 'boolean' },
};
const claimCodeBatchRule: ObjectRule = {
  required: { quantity: 'number', type: 'string', actionId: 'string' },
};
const claimCodeRule: ObjectRule = {
  required: {
    id: 'string',
    isActive: 'boolean',
    isUsed: 'boolean',
    code: 'string',
  },
};
const rewardRule: ObjectRule = {
  required: {
    id: 'string',
    name: 'string',
    description: 'nullableString',
    costInPoints: 'number',
    stock: 'number',
    isActive: 'boolean',
  },
};
const redemptionDeliveryBeforeRule: ObjectRule = {
  required: {
    id: 'string',
    status: 'string',
    deliveredAt: 'nullableDate',
    deliveredByAdminId: 'nullableString',
  },
};
const redemptionDeliveryAfterRule: ObjectRule = {
  required: {
    id: 'string',
    status: 'string',
    deliveredAt: 'date',
    deliveredByAdminId: 'string',
  },
};
const redemptionCancellationBeforeRule: ObjectRule = {
  required: {
    id: 'string',
    status: 'string',
    stock: 'number',
    points: 'number',
  },
};
const redemptionCancellationAfterRule: ObjectRule = {
  required: {
    ...redemptionCancellationBeforeRule.required,
    cancelledAt: 'date',
    cancelledByAdminId: 'string',
    pointEventId: 'string',
  },
};
const balanceRule: ObjectRule = {
  required: {
    participantId: 'string',
    points: 'number',
    xp: 'number',
  },
  optional: {
    pointEventId: 'string',
    originalPointEventId: 'string',
  },
};
const batchMetadataRule: ObjectRule = {
  required: {},
  optional: {
    actionId: 'string',
    batchSize: 'number',
    claimCodeIds: 'stringArray',
  },
};
const balanceMetadataRule: ObjectRule = {
  required: {},
  optional: {
    pointEventId: 'string',
    originalPointEventId: 'string',
    reversalPointEventId: 'string',
  },
};
const redemptionMetadataRule: ObjectRule = {
  required: {},
  optional: { rewardRedemptionId: 'string' },
};
const redemptionCancellationMetadataRule: ObjectRule = {
  required: {},
  optional: { rewardRedemptionId: 'string', pointEventId: 'string' },
};
const balanceBeforeRule: ObjectRule = {
  required: {
    participantId: 'string',
    points: 'number',
    xp: 'number',
    role: 'string',
    isActive: 'boolean',
  },
};
const balanceAdjustedAfterRule: ObjectRule = {
  required: {
    participantId: 'string',
    points: 'number',
    xp: 'number',
    role: 'string',
    isActive: 'boolean',
    pointEventId: 'string',
  },
};
const balanceReversalBeforeRule: ObjectRule = {
  required: {
    participantId: 'string',
    points: 'number',
    xp: 'number',
    originalPointEventId: 'string',
  },
};
const balanceReversalAfterRule: ObjectRule = {
  required: {
    participantId: 'string',
    points: 'number',
    xp: 'number',
    pointEventId: 'string',
    originalPointEventId: 'string',
  },
};

const operationRules = {
  [AuditOperation.PARTICIPANT_STATUS_CHANGED]: {
    entityType: AuditEntityType.PARTICIPANT,
    participant: 'required',
    before: participantStatusRule,
    after: participantStatusRule,
  },
  [AuditOperation.ACTION_CREATED]: {
    entityType: AuditEntityType.ACTION,
    participant: 'forbidden',
    after: actionRule,
  },
  [AuditOperation.ACTION_UPDATED]: {
    entityType: AuditEntityType.ACTION,
    participant: 'forbidden',
    before: actionRule,
    after: actionRule,
  },
  [AuditOperation.ACTION_STATUS_CHANGED]: {
    entityType: AuditEntityType.ACTION,
    participant: 'forbidden',
    before: activeEntityRule,
    after: activeEntityRule,
  },
  [AuditOperation.CLAIM_CODE_BATCH_GENERATED]: {
    entityType: AuditEntityType.CLAIM_CODE_BATCH,
    participant: 'forbidden',
    after: claimCodeBatchRule,
    metadata: batchMetadataRule,
  },
  [AuditOperation.CLAIM_CODE_STATUS_CHANGED]: {
    entityType: AuditEntityType.CLAIM_CODE,
    participant: 'optional',
    before: claimCodeRule,
    after: claimCodeRule,
  },
  [AuditOperation.REWARD_CREATED]: {
    entityType: AuditEntityType.REWARD,
    participant: 'forbidden',
    after: rewardRule,
  },
  [AuditOperation.REWARD_UPDATED]: {
    entityType: AuditEntityType.REWARD,
    participant: 'forbidden',
    before: rewardRule,
    after: rewardRule,
  },
  [AuditOperation.REWARD_STATUS_CHANGED]: {
    entityType: AuditEntityType.REWARD,
    participant: 'forbidden',
    before: activeEntityRule,
    after: activeEntityRule,
  },
  [AuditOperation.REWARD_REDEMPTION_DELIVERED]: {
    entityType: AuditEntityType.REWARD_REDEMPTION,
    participant: 'required',
    before: redemptionDeliveryBeforeRule,
    after: redemptionDeliveryAfterRule,
    metadata: redemptionMetadataRule,
  },
  [AuditOperation.REWARD_REDEMPTION_CANCELLED]: {
    entityType: AuditEntityType.REWARD_REDEMPTION,
    participant: 'required',
    before: redemptionCancellationBeforeRule,
    after: redemptionCancellationAfterRule,
    metadata: redemptionCancellationMetadataRule,
  },
  [AuditOperation.PARTICIPANT_BALANCE_ADJUSTED]: {
    entityType: AuditEntityType.POINT_EVENT,
    participant: 'required',
    before: balanceBeforeRule,
    after: balanceAdjustedAfterRule,
    metadata: { required: {}, optional: { pointEventId: 'string' } },
  },
  [AuditOperation.PARTICIPANT_BALANCE_ADJUSTMENT_REVERSED]: {
    entityType: AuditEntityType.POINT_EVENT,
    participant: 'required',
    before: balanceReversalBeforeRule,
    after: balanceReversalAfterRule,
    metadata: {
      required: {},
      optional: {
        originalPointEventId: 'string',
        reversalPointEventId: 'string',
      },
    },
  },
  [AuditOperation.RECONCILIATION_ADJUSTMENT_CONFIRMED]: {
    entityType: AuditEntityType.RECONCILIATION,
    participant: 'required',
    before: balanceRule,
    after: balanceRule,
    metadata: balanceMetadataRule,
  },
} satisfies Record<AuditOperation, OperationRule>;

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
    const rule = operationRules[input.operation] as OperationRule | undefined;
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
    const validContract =
      rule !== undefined &&
      input.entityType === rule.entityType &&
      ((rule.participant === 'required' &&
        typeof input.participantId === 'string' &&
        input.participantId.trim().length > 0) ||
        (rule.participant === 'optional' && validParticipant) ||
        (rule.participant === 'forbidden' &&
          input.participantId === undefined));
    if (
      !validRequestId ||
      !validEntity ||
      !validParticipant ||
      !validActor ||
      !validContract
    ) {
      throw new BadRequestException('Contexto de auditoria incompleto.');
    }
    validateOptionalObject(
      input.before,
      rule.before,
      'snapshot anterior',
      true,
      true,
      true,
    );
    validateOptionalObject(
      input.after,
      rule.after,
      'snapshot posterior',
      true,
      true,
      true,
    );
    validateOptionalObject(
      input.metadata,
      rule.metadata,
      'metadata',
      false,
      false,
      false,
    );
  }

  private sanitizeSnapshot(
    operation: AuditOperation,
    source: unknown,
  ): AuditJsonValue | undefined {
    if (source === null || source === undefined) return undefined;
    const value = source as unknown as Record<string, unknown>;
    switch (operation) {
      case AuditOperation.PARTICIPANT_STATUS_CHANGED:
        return pickScalarFields(value, ['id', 'isActive']);
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
          'pointEventId',
        ]);
      case AuditOperation.PARTICIPANT_BALANCE_ADJUSTED:
        return pickScalarFields(value, [
          'participantId',
          'points',
          'xp',
          'role',
          'isActive',
          'pointEventId',
        ]);
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

function validateOptionalObject(
  source: unknown,
  rule: ObjectRule | undefined,
  label: string,
  requiredWhenDeclared: boolean,
  rejectExtraFields: boolean,
  allowNullWithoutRule: boolean,
) {
  if (source === undefined) {
    if (rule && requiredWhenDeclared) {
      throw new BadRequestException(
        `O ${label} é obrigatório para a operação.`,
      );
    }
    return;
  }
  if (source === null && !rule && allowNullWithoutRule) return;
  if (!rule) {
    throw new BadRequestException(
      `O ${label} não é permitido para a operação.`,
    );
  }
  if (source === null || typeof source !== 'object' || Array.isArray(source)) {
    throw new BadRequestException(`O ${label} é inválido.`);
  }
  const value = source as Record<string, unknown>;
  const allowed = { ...rule.required, ...rule.optional };
  if (
    rejectExtraFields &&
    Object.keys(value).some((key) => !(key in allowed))
  ) {
    throw new BadRequestException(`O ${label} contém campos não permitidos.`);
  }
  for (const [key, kind] of Object.entries(rule.required)) {
    if (!(key in value) || !matchesFieldKind(value[key], kind)) {
      throw new BadRequestException(`O ${label} é inválido.`);
    }
  }
  for (const [key, kind] of Object.entries(rule.optional ?? {})) {
    if (key in value && !matchesFieldKind(value[key], kind)) {
      throw new BadRequestException(`O ${label} é inválido.`);
    }
  }
}

function matchesFieldKind(value: unknown, kind: FieldKind) {
  switch (kind) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'string':
      return typeof value === 'string';
    case 'stringArray':
      return (
        Array.isArray(value) && value.every((item) => typeof item === 'string')
      );
    case 'date':
      return typeof value === 'string' || value instanceof Date;
    case 'nullableString':
      return value === null || typeof value === 'string';
    case 'nullableDate':
      return (
        value === null || typeof value === 'string' || value instanceof Date
      );
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
