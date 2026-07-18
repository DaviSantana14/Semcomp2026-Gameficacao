import {
  AuditActorType,
  AuditEntityType,
  AuditOperation,
} from '@prisma/client';
import { AuditRepository } from './audit.repository';

describe(AuditRepository.name, () => {
  it('applies combined filters, database pagination and stable ordering', async () => {
    const prisma = {
      adminAuditEvent: {
        count: jest.fn().mockResolvedValue(3),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const repository = new AuditRepository(prisma as never);
    const from = new Date('2026-07-01T00:00:00.000Z');
    const to = new Date('2026-07-14T23:59:59.999Z');

    await repository.findPage({
      page: 2,
      limit: 20,
      actorType: AuditActorType.ADMIN,
      actorAdminId: 'admin-1',
      actorSearch: 'Ada',
      operation: AuditOperation.ACTION_UPDATED,
      entityType: AuditEntityType.ACTION,
      entityId: 'action-1',
      entitySearch: 'Palestra',
      participantId: 'participant-1',
      participantSearch: 'Grace',
      requestId: 'request-1',
      from,
      to,
    });

    const where = {
      AND: [
        {
          OR: [
            { actorDisplayName: { contains: 'Ada', mode: 'insensitive' } },
            { actorDisplayEmail: { contains: 'Ada', mode: 'insensitive' } },
          ],
        },
        {
          OR: [
            {
              participantDisplayName: {
                contains: 'Grace',
                mode: 'insensitive',
              },
            },
            {
              participantDisplayEmail: {
                contains: 'Grace',
                mode: 'insensitive',
              },
            },
          ],
        },
        {
          entityDisplayName: {
            contains: 'Palestra',
            mode: 'insensitive',
          },
        },
      ],
      actorType: AuditActorType.ADMIN,
      actorAdminId: 'admin-1',
      operation: AuditOperation.ACTION_UPDATED,
      entityType: AuditEntityType.ACTION,
      entityId: 'action-1',
      participantId: 'participant-1',
      requestId: 'request-1',
      createdAt: { gte: from, lte: to },
    };
    expect(prisma.adminAuditEvent.count).toHaveBeenCalledWith({ where });
    expect(prisma.adminAuditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        skip: 20,
        take: 20,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          actorType: true,
          actorAdminId: true,
          actorDisplayName: true,
          actorDisplayEmail: true,
          participantId: true,
          participantDisplayName: true,
          participantDisplayEmail: true,
          operation: true,
          entityType: true,
          entityId: true,
          entityDisplayName: true,
          reason: true,
          before: true,
          after: true,
          metadata: true,
          requestId: true,
          createdAt: true,
        },
      }),
    );
  });

  it.each([
    [AuditEntityType.PARTICIPANT, 'participant-1', 'Grace Hopper'],
    [AuditEntityType.ACTION, 'action-1', 'Palestra de abertura'],
    [AuditEntityType.CLAIM_CODE_BATCH, 'batch-1', 'Lote de códigos batch-1'],
    [AuditEntityType.CLAIM_CODE, 'claim-1', 'Código AB****YZ'],
    [AuditEntityType.REWARD, 'reward-1', 'Camiseta'],
    [AuditEntityType.REWARD_REDEMPTION, 'redemption-1', 'Resgate de Camiseta'],
    [AuditEntityType.POINT_EVENT, 'point-1', 'Evento de pontos point-1'],
    [
      AuditEntityType.RECONCILIATION,
      'reconciliation-1',
      'Reconciliação reconciliation-1',
    ],
  ])(
    'resolves ADMIN identities and the %s entity display in the bound transaction',
    async (entityType, entityId, entityDisplayName) => {
      const create = jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(data),
      );
      const transaction = {
        adminAuditEvent: { create },
        user: {
          findUnique: jest.fn(({ where }: { where: { id: string } }) =>
            Promise.resolve(
              where.id === 'admin-1'
                ? { name: 'Ada Lovelace', email: 'ada@example.com' }
                : { name: 'Grace Hopper', email: 'grace@example.com' },
            ),
          ),
        },
        action: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ name: 'Palestra de abertura' }),
        },
        reward: {
          findUnique: jest.fn().mockResolvedValue({ name: 'Camiseta' }),
        },
        rewardRedemption: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ reward: { name: 'Camiseta' } }),
        },
      };
      const repository = new AuditRepository({} as never);

      await repository.bindTransaction(transaction as never).create({
        actorType: AuditActorType.ADMIN,
        actorAdminId: 'admin-1',
        participantId: 'participant-1',
        operation: AuditOperation.CLAIM_CODE_STATUS_CHANGED,
        entityType,
        entityId,
        reason: 'Alteração administrativa necessária',
        before: {
          id: 'claim-1',
          isActive: true,
          isUsed: false,
          maskedCode: 'AB****YZ',
        },
        after: {
          id: 'claim-1',
          isActive: false,
          isUsed: false,
          maskedCode: 'AB****YZ',
        },
        requestId: 'request-1',
      });

      expect(create.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          actorDisplayName: 'Ada Lovelace',
          actorDisplayEmail: 'ada@example.com',
          participantDisplayName: 'Grace Hopper',
          participantDisplayEmail: 'grace@example.com',
          entityDisplayName,
        }),
      );
      expect(JSON.stringify(create.mock.calls)).not.toContain('52998224725');
      if (entityType === AuditEntityType.CLAIM_CODE) {
        expect(JSON.stringify(create.mock.calls)).not.toContain('AB1234YZ');
      }
    },
  );

  it('uses a fixed SYSTEM identity and deterministic translated fallbacks', async () => {
    const create = jest.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(data),
    );
    const transaction = {
      adminAuditEvent: { create },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      action: { findUnique: jest.fn().mockResolvedValue(null) },
      reward: { findUnique: jest.fn().mockResolvedValue(null) },
      rewardRedemption: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const repository = new AuditRepository({} as never);

    await repository.bindTransaction(transaction as never).create({
      actorType: AuditActorType.SYSTEM,
      actorAdminId: null,
      participantId: null,
      operation: AuditOperation.ACTION_UPDATED,
      entityType: AuditEntityType.ACTION,
      entityId: 'missing-action',
      reason: 'Rotina automática necessária',
      requestId: 'request-1',
    });

    expect(create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        actorDisplayName: 'Sistema',
        actorDisplayEmail: null,
        participantDisplayName: null,
        participantDisplayEmail: null,
        entityDisplayName: 'Atividade missing-action',
      }),
    );
  });

  it('drops an invalid raw claim code mask and never persists a mocked CPF', async () => {
    const rawCode = 'AB1234YZ';
    const cpf = '52998224725';
    const create = jest.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(data),
    );
    const findUnique = jest.fn().mockResolvedValue({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      cpf,
    });
    const transaction = {
      adminAuditEvent: { create },
      user: { findUnique },
      action: { findUnique: jest.fn() },
      reward: { findUnique: jest.fn() },
      rewardRedemption: { findUnique: jest.fn() },
    };
    const repository = new AuditRepository({} as never);

    await repository.bindTransaction(transaction as never).create({
      actorType: AuditActorType.ADMIN,
      actorAdminId: 'admin-1',
      participantId: 'participant-1',
      operation: AuditOperation.CLAIM_CODE_STATUS_CHANGED,
      entityType: AuditEntityType.CLAIM_CODE,
      entityId: 'claim-unsafe',
      reason: 'Desativação administrativa necessária',
      before: {
        id: 'claim-unsafe',
        isActive: true,
        isUsed: false,
        maskedCode: rawCode,
      },
      after: {
        id: 'claim-unsafe',
        isActive: false,
        isUsed: false,
        maskedCode: rawCode,
      },
      requestId: 'request-1',
    });

    expect(findUnique).toHaveBeenNthCalledWith(1, {
      where: { id: 'admin-1' },
      select: { name: true, email: true },
    });
    expect(findUnique).toHaveBeenNthCalledWith(2, {
      where: { id: 'participant-1' },
      select: { name: true, email: true },
    });
    expect(create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ entityDisplayName: 'Código claim-unsafe' }),
    );
    expect(JSON.stringify(create.mock.calls[0][0].data)).not.toContain(rawCode);
    expect(JSON.stringify(create.mock.calls[0][0].data)).not.toContain(cpf);
  });

  it('binds writes to the exact transaction client without opening a transaction', async () => {
    const rootCreate = jest.fn();
    const transactionCreate = jest.fn().mockResolvedValue({ id: 'audit-1' });
    const transaction = {
      adminAuditEvent: { create: transactionCreate },
    };
    const prisma = {
      adminAuditEvent: { create: rootCreate },
      $transaction: jest.fn(),
    };
    const repository = new AuditRepository(prisma as never);

    await repository.bindTransaction(transaction as never).create({
      actorType: AuditActorType.SYSTEM,
      actorAdminId: null,
      participantId: null,
      operation: AuditOperation.RECONCILIATION_ADJUSTMENT_CONFIRMED,
      entityType: AuditEntityType.RECONCILIATION,
      entityId: 'reconciliation-1',
      reason: 'Correção automática reconciliada',
      requestId: 'request-1',
    });

    expect(transactionCreate).toHaveBeenCalledTimes(1);
    expect(rootCreate).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rolls back a provisional domain mutation and audit write after a failure', async () => {
    const committed = { domain: [] as string[], audit: [] as string[] };
    const prisma = {
      adminAuditEvent: { count: jest.fn(), findMany: jest.fn() },
      $transaction: jest.fn(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          const provisional = {
            domain: [...committed.domain],
            audit: [] as string[],
          };
          const tx = {
            domain: {
              create: (id: string) => provisional.domain.push(id),
            },
            adminAuditEvent: {
              create: ({ data }: { data: { entityId: string } }) => {
                provisional.audit.push(data.entityId);
                return Promise.resolve(data);
              },
            },
          };
          const result = await callback(tx);
          committed.domain = provisional.domain;
          committed.audit = provisional.audit;
          return result;
        },
      ),
    };
    const repository = new AuditRepository(prisma as never);

    await expect(
      prisma.$transaction(async (tx) => {
        (tx as { domain: { create(id: string): void } }).domain.create(
          'domain-1',
        );
        await repository.bindTransaction(tx as never).create({
          actorType: AuditActorType.SYSTEM,
          actorAdminId: null,
          participantId: null,
          operation: AuditOperation.RECONCILIATION_ADJUSTMENT_CONFIRMED,
          entityType: AuditEntityType.RECONCILIATION,
          entityId: 'reconciliation-1',
          reason: 'Correção automática reconciliada',
          requestId: 'request-1',
        });
        throw new Error('fail after provisional writes');
      }),
    ).rejects.toThrow('fail after provisional writes');
    expect(committed).toEqual({ domain: [], audit: [] });
  });
});
