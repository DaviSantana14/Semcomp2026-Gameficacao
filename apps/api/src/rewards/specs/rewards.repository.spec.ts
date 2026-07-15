/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  PointEventKind,
  PointEventSource,
  RedemptionStatus,
} from '@prisma/client';
import { RewardsRepository } from '../rewards.repository';
import { RewardsService } from '../rewards.service';

const activeReward = {
  id: 'reward-1',
  name: 'Camiseta Semcomp',
  description: 'Camiseta oficial do evento',
  costInPoints: 50,
  stock: 3,
  isActive: true,
  imageUrl: null,
  createdAt: new Date('2026-05-17T12:00:00.000Z'),
  updatedAt: new Date('2026-05-17T12:00:00.000Z'),
};

const pendingRedemption = {
  id: 'redemption-1',
  userId: 'user-1',
  rewardId: 'reward-1',
  pointsSpent: 50,
  status: 'PENDING',
  deliveredAt: null,
  deliveredByAdminId: null,
  cancelledAt: null,
  cancelledByAdminId: null,
  pointEvents: [],
  createdAt: new Date('2026-05-17T13:00:00.000Z'),
  updatedAt: new Date('2026-05-17T13:00:00.000Z'),
  user: {
    id: 'user-1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    points: 100,
  },
  reward: activeReward,
};

function createRepository() {
  const tx = {
    $queryRaw: jest.fn((strings: TemplateStringsArray) => {
      const sql = strings.join('?');
      if (sql.includes('"RewardRedemption"')) {
        return Promise.resolve([pendingRedemption]);
      }
      if (sql.includes('"User"')) {
        return Promise.resolve([{ id: 'user-1', points: 100 }]);
      }
      return Promise.resolve([activeReward]);
    }),
    reward: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    rewardRedemption: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    pointEvent: {
      create: jest.fn(),
    },
    user: {
      updateMany: jest.fn(),
      update: jest.fn(),
    },
  };
  const prisma = {
    reward: {
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    rewardRedemption: {
      count: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    ),
  };

  const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
  const persistenceRepository = new RewardsRepository(prisma as never);
  return {
    repository: new RewardsService(persistenceRepository, audit as never),
    persistenceRepository,
    prisma,
    tx,
    audit,
  };
}

describe('RewardsRepository', () => {
  it('locks the complete reward state with a parameterized row lock', async () => {
    const { persistenceRepository, tx } = createRepository();
    tx.$queryRaw.mockResolvedValueOnce([activeReward]);

    await persistenceRepository.withTransaction(async (repository) => {
      await expect(repository.lockRewardState('reward-1')).resolves.toEqual(
        activeReward,
      );
    });

    const rawCalls = tx.$queryRaw.mock.calls as unknown as Array<
      [TemplateStringsArray, string]
    >;
    expect(rawCalls).toHaveLength(1);
    expect(rawCalls[0]?.[0].join('?')).toMatch(
      /FROM "Reward"[\s\S]*WHERE "id" = \?[\s\S]*FOR UPDATE/,
    );
    expect(rawCalls[0]?.[1]).toBe('reward-1');
  });

  it('locks cancellation state in a stable parameterized order', async () => {
    const { persistenceRepository, tx } = createRepository();
    tx.$queryRaw
      .mockResolvedValueOnce([
        {
          id: 'redemption-1',
          userId: 'user-1',
          rewardId: 'reward-1',
          pointsSpent: 50,
          status: 'PENDING',
          deliveredAt: null,
          deliveredByAdminId: null,
          cancelledAt: null,
          cancelledByAdminId: null,
        },
      ])
      .mockResolvedValueOnce([{ id: 'user-1', points: 100 }])
      .mockResolvedValueOnce([
        { id: 'reward-1', name: 'Camiseta Semcomp', stock: 3 },
      ]);

    await persistenceRepository.withTransaction(async (repository) => {
      await expect(
        repository.lockCancellationState('redemption-1'),
      ).resolves.toMatchObject({
        user: { id: 'user-1', points: 100 },
        reward: { id: 'reward-1', stock: 3 },
      });
    });

    const rawCalls = tx.$queryRaw.mock.calls as unknown as Array<
      [TemplateStringsArray, string]
    >;
    expect(rawCalls).toHaveLength(3);
    expect(rawCalls.map(([sql]) => sql.join('?'))).toEqual([
      expect.stringMatching(/FROM "RewardRedemption"[\s\S]*FOR UPDATE/),
      expect.stringMatching(/FROM "User"[\s\S]*FOR UPDATE/),
      expect.stringMatching(/FROM "Reward"[\s\S]*FOR UPDATE/),
    ]);
    expect(rawCalls.map(([, id]) => id)).toEqual([
      'redemption-1',
      'user-1',
      'reward-1',
    ]);
  });

  describe('findAdminRewards', () => {
    it.each([
      ['all', {}],
      ['active', { isActive: true }],
      ['inactive', { isActive: false }],
      ['out_of_stock', { isActive: true, stock: 0 }],
    ])(
      'maps public reward status %s to Prisma filters',
      async (status, expectedWhere) => {
        const { repository, prisma } = createRepository();
        prisma.reward.count.mockResolvedValue(0);
        prisma.reward.findMany.mockResolvedValue([]);

        await repository.findAdminRewards({
          page: 1,
          limit: 20,
          status,
        } as never);

        expect(prisma.reward.count).toHaveBeenCalledWith({
          where: expectedWhere,
        });
      },
    );

    it('searches and paginates the full admin catalog with redemption counts', async () => {
      const { repository, prisma } = createRepository();
      const inactiveReward = {
        ...activeReward,
        id: 'reward-2',
        name: 'Caneca Semcomp',
        stock: 0,
        isActive: false,
      };
      prisma.reward.count.mockResolvedValue(1);
      prisma.reward.findMany.mockResolvedValue([inactiveReward]);
      prisma.rewardRedemption.groupBy.mockResolvedValue([
        {
          rewardId: 'reward-2',
          status: RedemptionStatus.PENDING,
          _count: { _all: 2 },
        },
        {
          rewardId: 'reward-2',
          status: RedemptionStatus.CANCELLED,
          _count: { _all: 1 },
        },
      ]);

      await expect(
        repository.findAdminRewards({
          page: 2,
          limit: 5,
          status: 'all',
          search: ' caneca ',
        } as never),
      ).resolves.toEqual({
        items: [
          {
            ...inactiveReward,
            redemptionCounts: {
              PENDING: 2,
              DELIVERED: 0,
              CANCELLED: 1,
            },
          },
        ],
        meta: { page: 2, limit: 5, total: 1, totalPages: 1 },
      });

      const where = {
        OR: [
          { name: { contains: 'caneca', mode: 'insensitive' } },
          { description: { contains: 'caneca', mode: 'insensitive' } },
        ],
      };
      expect(prisma.reward.count).toHaveBeenCalledWith({ where });
      expect(prisma.reward.findMany).toHaveBeenCalledWith({
        where,
        skip: 5,
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          description: true,
          costInPoints: true,
          stock: true,
          isActive: true,
          imageUrl: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      expect(prisma.rewardRedemption.groupBy).toHaveBeenCalledWith({
        by: ['rewardId', 'status'],
        where: { rewardId: { in: ['reward-2'] } },
        _count: { _all: true },
      });
    });
  });

  describe('findRedemptions', () => {
    it.each([
      ['all', undefined],
      ['pending', RedemptionStatus.PENDING],
      ['delivered', RedemptionStatus.DELIVERED],
      ['cancelled', RedemptionStatus.CANCELLED],
    ])(
      'maps public redemption status %s to Prisma status',
      async (status, expectedStatus) => {
        const { repository, prisma } = createRepository();
        prisma.rewardRedemption.count.mockResolvedValue(0);
        prisma.rewardRedemption.findMany.mockResolvedValue([]);

        await repository.findRedemptions({
          page: 1,
          limit: 20,
          status,
        } as never);

        expect(prisma.rewardRedemption.count).toHaveBeenCalledWith({
          where: expectedStatus ? { status: expectedStatus } : {},
        });
      },
    );

    it('filters and returns recent redemption snapshots with controlled selects', async () => {
      const { repository, prisma } = createRepository();
      prisma.rewardRedemption.count.mockResolvedValue(1);
      prisma.rewardRedemption.findMany.mockResolvedValue([pendingRedemption]);

      await expect(
        repository.findRedemptions({
          page: 1,
          limit: 20,
          status: 'pending',
          rewardId: 'reward-1',
          search: ' ada ',
        }),
      ).resolves.toEqual({
        items: [pendingRedemption],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });
      const where = {
        status: RedemptionStatus.PENDING,
        rewardId: 'reward-1',
        user: {
          OR: [
            { name: { contains: 'ada', mode: 'insensitive' } },
            { email: { contains: 'ada', mode: 'insensitive' } },
          ],
        },
      };
      expect(prisma.rewardRedemption.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where,
          skip: 0,
          take: 20,
          orderBy: { createdAt: 'desc' },
          select: expect.objectContaining({
            deliveredAt: true,
            deliveredByAdminId: true,
            cancelledAt: true,
            cancelledByAdminId: true,
            pointEvents: expect.any(Object),
          }),
        }),
      );
    });
  });
  describe('redeem', () => {
    it('debits points and stock without changing xp', async () => {
      const { repository, tx } = createRepository();

      tx.reward.findUnique.mockResolvedValue(activeReward);
      tx.user.updateMany.mockResolvedValue({ count: 1 });
      tx.reward.updateMany.mockResolvedValue({ count: 1 });
      tx.rewardRedemption.create.mockResolvedValue(pendingRedemption);
      tx.pointEvent.create.mockResolvedValue(undefined);

      const result = await repository.redeem('reward-1', 'user-1');

      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'user-1',
          points: { gte: 50 },
        },
        data: {
          points: { decrement: 50 },
        },
      });
      expect(tx.reward.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'reward-1',
          isActive: true,
          stock: { gt: 0 },
        },
        data: {
          stock: { decrement: 1 },
        },
      });
      expect(tx.rewardRedemption.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            userId: 'user-1',
            rewardId: 'reward-1',
            pointsSpent: 50,
          },
          include: expect.objectContaining({
            pointEvents: expect.any(Object),
          }),
        }),
      );
      expect(tx.pointEvent.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          points: -50,
          kind: PointEventKind.DEBIT,
          source: PointEventSource.REWARD_REDEMPTION,
          description: 'Resgate de recompensa: Camiseta Semcomp',
          rewardRedemptionId: 'redemption-1',
        },
      });
      expect(result).toEqual(pendingRedemption);
    });

    it('rejects redeem when the user does not have enough points', async () => {
      const { repository, tx } = createRepository();

      tx.reward.findUnique.mockResolvedValue(activeReward);
      tx.user.updateMany.mockResolvedValue({ count: 0 });

      await expect(repository.redeem('reward-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(tx.reward.updateMany).not.toHaveBeenCalled();
      expect(tx.rewardRedemption.create).not.toHaveBeenCalled();
    });

    it('rejects redeem when stock is exhausted concurrently', async () => {
      const { repository, tx } = createRepository();

      tx.reward.findUnique.mockResolvedValue(activeReward);
      tx.user.updateMany.mockResolvedValue({ count: 1 });
      tx.reward.updateMany.mockResolvedValue({ count: 0 });

      await expect(repository.redeem('reward-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(tx.rewardRedemption.create).not.toHaveBeenCalled();
    });

    it('rejects redeem when reward is deactivated concurrently', async () => {
      const { repository, tx } = createRepository();

      tx.reward.findUnique.mockResolvedValue(activeReward);
      tx.user.updateMany.mockResolvedValue({ count: 1 });
      tx.reward.updateMany.mockResolvedValue({ count: 0 });

      await expect(repository.redeem('reward-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(tx.reward.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'reward-1',
          isActive: true,
          stock: { gt: 0 },
        },
        data: {
          stock: { decrement: 1 },
        },
      });
      expect(tx.rewardRedemption.create).not.toHaveBeenCalled();
      expect(tx.pointEvent.create).not.toHaveBeenCalled();
    });
  });

  describe('cancelRedemption', () => {
    it('returns points and stock for pending redemptions without changing xp', async () => {
      const { repository, tx } = createRepository();

      tx.rewardRedemption.findUnique.mockResolvedValue(pendingRedemption);
      tx.rewardRedemption.updateMany.mockResolvedValue({ count: 1 });
      tx.rewardRedemption.findUnique
        .mockResolvedValueOnce(pendingRedemption)
        .mockResolvedValueOnce({
          ...pendingRedemption,
          status: 'CANCELLED',
        });
      tx.user.update.mockResolvedValue({ points: 150 });
      tx.reward.update.mockResolvedValue({ stock: 4 });
      tx.pointEvent.create.mockResolvedValue({ id: 'refund-1' });

      await repository.cancelRedemption(
        'redemption-1',
        { reason: 'Cancelamento aprovado pela coordenação' },
        { actorAdminId: 'admin-1', requestId: 'request-1' },
      );

      expect(tx.rewardRedemption.updateMany).toHaveBeenCalledWith({
        where: { id: 'redemption-1', status: 'PENDING' },
        data: expect.objectContaining({
          status: 'CANCELLED',
          cancelledByAdminId: 'admin-1',
          cancelledAt: expect.any(Date),
        }),
      });
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { points: { increment: 50 } },
      });
      expect(tx.reward.update).toHaveBeenCalledWith({
        where: { id: 'reward-1' },
        data: { stock: { increment: 1 } },
      });
      expect(tx.pointEvent.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          points: 50,
          kind: PointEventKind.CREDIT,
          source: PointEventSource.REWARD_REDEMPTION,
          description: 'Cancelamento de recompensa: Camiseta Semcomp',
          rewardRedemptionId: 'redemption-1',
        },
      });
    });

    it('rejects cancel when redemption is not pending', async () => {
      const { repository, tx } = createRepository();

      tx.$queryRaw.mockResolvedValueOnce([
        { ...pendingRedemption, status: 'DELIVERED' },
      ]);

      await expect(
        repository.cancelRedemption(
          'redemption-1',
          { reason: 'Cancelamento aprovado pela coordenação' },
          { actorAdminId: 'admin-1', requestId: 'request-1' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('does not refund points or stock when cancel loses a status race', async () => {
      const { repository, tx } = createRepository();

      tx.rewardRedemption.findUnique.mockResolvedValue(pendingRedemption);
      tx.rewardRedemption.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        repository.cancelRedemption(
          'redemption-1',
          { reason: 'Cancelamento aprovado pela coordenação' },
          { actorAdminId: 'admin-1', requestId: 'request-1' },
        ),
      ).rejects.toThrow(ConflictException);
      expect(tx.user.update).not.toHaveBeenCalled();
      expect(tx.reward.update).not.toHaveBeenCalled();
      expect(tx.pointEvent.create).not.toHaveBeenCalled();
    });
  });

  it('creates rewards with normalized optional fields', async () => {
    const { repository, tx } = createRepository();
    tx.reward.create.mockResolvedValue(activeReward);

    await repository.create(
      {
        name: ' Camiseta Semcomp ',
        description: ' ',
        costInPoints: 50,
        stock: 3,
        imageUrl: '',
        isActive: true,
        reason: 'Inclusao aprovada pela coordenação',
      },
      { actorAdminId: 'admin-1', requestId: 'request-1' },
    );

    expect(tx.reward.create).toHaveBeenCalledWith({
      data: {
        name: 'Camiseta Semcomp',
        description: undefined,
        costInPoints: 50,
        stock: 3,
        imageUrl: undefined,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        costInPoints: true,
        stock: true,
        isActive: true,
        imageUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it('explicitly clears optional reward details on update', async () => {
    const { repository, tx } = createRepository();
    tx.$queryRaw.mockResolvedValueOnce([
      {
        ...activeReward,
        imageUrl: 'https://example.test/old.png',
      },
    ]);
    tx.reward.update.mockResolvedValue({
      ...activeReward,
      description: '',
      imageUrl: null,
    });

    await repository.update(
      'reward-1',
      {
        description: '',
        imageUrl: null,
        reason: 'Atualizacao aprovada pela coordenação',
      },
      { actorAdminId: 'admin-1', requestId: 'request-1' },
    );

    expect(tx.reward.update).toHaveBeenCalledWith({
      where: { id: 'reward-1' },
      data: {
        description: '',
        imageUrl: null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        costInPoints: true,
        stock: true,
        isActive: true,
        imageUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it('lists pending redemptions for admin operation', async () => {
    const { repository, prisma } = createRepository();
    prisma.rewardRedemption.findMany.mockResolvedValue([pendingRedemption]);

    await expect(repository.findPendingRedemptions()).resolves.toEqual([
      pendingRedemption,
    ]);
    expect(prisma.rewardRedemption.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'PENDING' },
        include: expect.objectContaining({ pointEvents: expect.any(Object) }),
        orderBy: { createdAt: 'asc' },
      }),
    );
  });

  it('marks pending redemptions as delivered', async () => {
    const { repository, tx } = createRepository();
    tx.rewardRedemption.findUnique.mockResolvedValue({
      ...pendingRedemption,
      status: 'DELIVERED',
    });
    tx.rewardRedemption.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      repository.deliverRedemption(
        'redemption-1',
        { reason: 'Entrega confirmada pela coordenação' },
        { actorAdminId: 'admin-1', requestId: 'request-1' },
      ),
    ).resolves.toMatchObject({
      status: 'DELIVERED',
    });
    expect(tx.rewardRedemption.updateMany).toHaveBeenCalledWith({
      where: { id: 'redemption-1', status: 'PENDING' },
      data: expect.objectContaining({
        status: 'DELIVERED',
        deliveredByAdminId: 'admin-1',
        deliveredAt: expect.any(Date),
      }),
    });
  });

  it('rejects deliver when it loses a status race', async () => {
    const { repository, tx } = createRepository();
    tx.rewardRedemption.findUnique.mockResolvedValue(pendingRedemption);
    tx.rewardRedemption.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.deliverRedemption(
        'redemption-1',
        { reason: 'Entrega confirmada pela coordenação' },
        { actorAdminId: 'admin-1', requestId: 'request-1' },
      ),
    ).rejects.toThrow(ConflictException);
    expect(tx.rewardRedemption.findUnique).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when reward does not exist', async () => {
    const { repository, tx } = createRepository();
    tx.reward.findUnique.mockResolvedValue(null);

    await expect(repository.redeem('missing', 'user-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
