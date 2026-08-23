import {
  ActionRedemptionMethod,
  AuditActorType,
  AuditEntityType,
  AuditOperation,
} from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { AuditService, RecordAuditEventInput } from './audit.service';

const actor = {
  actorType: AuditActorType.ADMIN,
  actorAdminId: 'admin-1',
  requestId: 'request-1',
} as const;

const action = {
  id: 'action-1',
  name: 'Palestra',
  description: null,
  type: 'LECTURE',
  points: 10,
  isActive: true,
  isCodeActive: true,
};
const reward = {
  id: 'reward-1',
  name: 'Camiseta',
  description: null,
  costInPoints: 40,
  stock: 3,
  isActive: true,
};
const reconciliation = {
  participantId: 'participant-1',
  storedPoints: 10,
  storedXp: 20,
  ledgerPoints: 8,
  ledgerXp: 17,
  pointsDifference: 2,
  xpDifference: 3,
};

const operationMatrix: Array<{
  input: RecordAuditEventInput;
  expected: Record<string, unknown>;
}> = [
  {
    input: {
      actor,
      operation: AuditOperation.PARTICIPANT_STATUS_CHANGED,
      entityType: AuditEntityType.PARTICIPANT,
      entityId: 'participant-1',
      participantId: 'participant-1',
      reason: '  Status alterado pela coordenacao  ',
      before: { id: 'participant-1', isActive: true },
      after: { id: 'participant-1', isActive: false },
    },
    expected: { participantId: 'participant-1' },
  },
  {
    input: {
      actor,
      operation: AuditOperation.ACTION_CREATED,
      entityType: AuditEntityType.ACTION,
      entityId: action.id,
      reason: 'Criacao da atividade aprovada',
      before: null,
      after: action,
    },
    expected: { participantId: null, before: undefined },
  },
  {
    input: {
      actor,
      operation: AuditOperation.ACTION_UPDATED,
      entityType: AuditEntityType.ACTION,
      entityId: action.id,
      reason: 'Edicao da atividade aprovada',
      before: action,
      after: { ...action, points: 20 },
    },
    expected: { participantId: null },
  },
  {
    input: {
      actor,
      operation: AuditOperation.ACTION_STATUS_CHANGED,
      entityType: AuditEntityType.ACTION,
      entityId: action.id,
      reason: 'Status da atividade alterado',
      before: { isActive: true },
      after: { isActive: false },
    },
    expected: { participantId: null },
  },
  {
    input: {
      actor,
      operation: AuditOperation.CLAIM_CODE_BATCH_GENERATED,
      entityType: AuditEntityType.CLAIM_CODE_BATCH,
      entityId: 'batch-1',
      reason: 'Lote solicitado pela coordenacao',
      after: {
        requestedQuantity: 2,
        createdQuantity: 2,
        redemptionMethod: ActionRedemptionMethod.CLAIM_CODE,
        actionId: action.id,
      },
      metadata: {
        actionId: action.id,
        batchSize: 2,
        claimCodeIds: ['code-1', 'code-2'],
      },
    },
    expected: { participantId: null },
  },
  {
    input: {
      actor,
      operation: AuditOperation.CLAIM_CODE_STATUS_CHANGED,
      entityType: AuditEntityType.CLAIM_CODE,
      entityId: 'code-1',
      reason: 'Codigo desativado pelo suporte',
      before: {
        id: 'code-1',
        isActive: true,
        isUsed: false,
        maskedCode: 'AB********56',
      },
      after: {
        id: 'code-1',
        isActive: false,
        isUsed: false,
        maskedCode: 'AB********56',
      },
    },
    expected: { participantId: null },
  },
  {
    input: {
      actor,
      operation: AuditOperation.CLAIM_CODE_BULK_STATUS_CHANGED,
      entityType: AuditEntityType.CLAIM_CODE_BULK_OPERATION,
      entityId: 'bulk-1',
      reason: 'Desativacao preventiva do lote selecionado',
      after: {
        targetIsActive: false,
        selectedCount: 4,
        changedCount: 2,
        unchangedCount: 1,
        usedCount: 1,
        notFoundCount: 0,
      },
    },
    expected: { participantId: null },
  },
  {
    input: {
      actor,
      operation: AuditOperation.REWARD_CREATED,
      entityType: AuditEntityType.REWARD,
      entityId: reward.id,
      reason: 'Premio criado pela coordenacao',
      before: null,
      after: reward,
    },
    expected: { participantId: null, before: undefined },
  },
  {
    input: {
      actor,
      operation: AuditOperation.REWARD_UPDATED,
      entityType: AuditEntityType.REWARD,
      entityId: reward.id,
      reason: 'Premio atualizado pela coordenacao',
      before: reward,
      after: { ...reward, stock: 5 },
    },
    expected: { participantId: null },
  },
  {
    input: {
      actor,
      operation: AuditOperation.REWARD_STATUS_CHANGED,
      entityType: AuditEntityType.REWARD,
      entityId: reward.id,
      reason: 'Premio retirado do catalogo',
      before: { isActive: true },
      after: { isActive: false },
    },
    expected: { participantId: null },
  },
  {
    input: {
      actor,
      operation: AuditOperation.REWARD_REDEMPTION_DELIVERED,
      entityType: AuditEntityType.REWARD_REDEMPTION,
      entityId: 'redemption-1',
      participantId: 'participant-1',
      reason: 'Entrega confirmada presencialmente',
      before: {
        id: 'redemption-1',
        status: 'PENDING',
        deliveredAt: null,
        deliveredByAdminId: null,
      },
      after: {
        id: 'redemption-1',
        status: 'DELIVERED',
        deliveredAt: '2026-07-15T12:00:00.000Z',
        deliveredByAdminId: 'admin-1',
      },
      metadata: { rewardRedemptionId: 'redemption-1' },
    },
    expected: { participantId: 'participant-1' },
  },
  {
    input: {
      actor,
      operation: AuditOperation.REWARD_REDEMPTION_CANCELLED,
      entityType: AuditEntityType.REWARD_REDEMPTION,
      entityId: 'redemption-1',
      participantId: 'participant-1',
      reason: 'Cancelamento confirmado pela coordenacao',
      before: { id: 'redemption-1', status: 'PENDING', stock: 2, points: 40 },
      after: {
        id: 'redemption-1',
        status: 'CANCELLED',
        stock: 3,
        points: 80,
        cancelledAt: '2026-07-15T12:00:00.000Z',
        cancelledByAdminId: 'admin-1',
        pointEventId: 'refund-1',
      },
      metadata: {
        rewardRedemptionId: 'redemption-1',
        pointEventId: 'refund-1',
      },
    },
    expected: { participantId: 'participant-1' },
  },
  {
    input: {
      actor,
      operation: AuditOperation.PARTICIPANT_BALANCE_ADJUSTED,
      entityType: AuditEntityType.POINT_EVENT,
      entityId: 'point-1',
      participantId: 'participant-1',
      reason: 'Saldo corrigido pela coordenacao',
      before: {
        participantId: 'participant-1',
        points: 10,
        xp: 20,
        role: 'PARTICIPANT',
        isActive: true,
      },
      after: {
        participantId: 'participant-1',
        points: 12,
        xp: 23,
        role: 'PARTICIPANT',
        isActive: true,
        pointEventId: 'point-1',
      },
      metadata: { pointEventId: 'point-1' },
    },
    expected: { participantId: 'participant-1' },
  },
  {
    input: {
      actor,
      operation: AuditOperation.PARTICIPANT_BALANCE_ADJUSTMENT_REVERSED,
      entityType: AuditEntityType.POINT_EVENT,
      entityId: 'reversal-1',
      participantId: 'participant-1',
      reason: 'Ajuste estornado pela coordenacao',
      before: {
        participantId: 'participant-1',
        points: 12,
        xp: 23,
        originalPointEventId: 'point-1',
      },
      after: {
        participantId: 'participant-1',
        points: 10,
        xp: 20,
        pointEventId: 'reversal-1',
        originalPointEventId: 'point-1',
      },
      metadata: {
        originalPointEventId: 'point-1',
        reversalPointEventId: 'reversal-1',
      },
    },
    expected: { participantId: 'participant-1' },
  },
  {
    input: {
      actor,
      operation: AuditOperation.RECONCILIATION_ADJUSTMENT_CONFIRMED,
      entityType: AuditEntityType.RECONCILIATION,
      entityId: 'reconciliation-1',
      participantId: 'participant-1',
      reason: 'Divergencia reconciliada pela coordenacao',
      before: reconciliation,
      after: {
        ...reconciliation,
        ledgerPoints: 10,
        ledgerXp: 20,
        pointsDifference: 0,
        xpDifference: 0,
        pointEventId: 'compensation-1',
      },
      metadata: { pointEventId: 'compensation-1' },
    },
    expected: { participantId: 'participant-1' },
  },
];

describe('audit operation security matrix', () => {
  const create = jest.fn((data: unknown) => Promise.resolve(data));
  const writer = { create } as never;
  const service = new AuditService({ findPage: jest.fn() } as never);

  beforeEach(() => jest.clearAllMocks());

  it.each(operationMatrix)(
    'persists the allowlisted contract for $input.operation',
    async ({ input, expected }) => {
      await service.record(writer, input);

      expect(create).toHaveBeenCalledWith({
        actorType: AuditActorType.ADMIN,
        actorAdminId: 'admin-1',
        participantId: null,
        operation: input.operation,
        entityType: input.entityType,
        entityId: input.entityId,
        reason: input.reason.trim(),
        before: input.before === null ? undefined : input.before,
        after: input.after,
        metadata: input.metadata,
        requestId: 'request-1',
        ...expected,
      });
    },
  );

  it.each(operationMatrix)(
    'rejects forbidden snapshot material for $input.operation',
    async ({ input }) => {
      const unsafeInput = {
        ...input,
        after: {
          ...input.after,
          cookie: 'access_token=secret',
          authorization: 'Bearer jwt-secret',
          csrfToken: 'csrf-secret',
          password: 'password-secret',
          passwordHash: 'hash-secret',
          headers: { authorization: 'Bearer secret' },
          requestBody: { code: 'FULL-UNIQUE-CODE' },
          reusableCode: 'FULL-REUSABLE-CODE',
          stack: 'database stack trace',
          prisma: { code: 'P2002', meta: 'database internals' },
        },
      };

      await expect(
        service.record(writer, unsafeInput as RecordAuditEventInput),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(create).not.toHaveBeenCalled();
    },
  );
});
