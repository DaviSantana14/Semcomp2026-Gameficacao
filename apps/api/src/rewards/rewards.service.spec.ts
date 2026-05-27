import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PointEventKind, PointEventSource } from '@prisma/client';
import { RewardsService } from './rewards.service';

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
  createdAt: new Date('2026-05-17T13:00:00.000Z'),
  updatedAt: new Date('2026-05-17T13:00:00.000Z'),
  user: {
    id: 'user-1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
  },
  reward: activeReward,
};

function createService() {
  const tx = {
    reward: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    rewardRedemption: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
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
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    rewardRedemption: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    ),
  };

  return {
    service: new RewardsService(prisma as never),
    prisma,
    tx,
  };
}

describe('RewardsService', () => {
  describe('redeem', () => {
    it('debits points and stock without changing xp', async () => {
      const { service, tx } = createService();

      tx.reward.findUnique.mockResolvedValue(activeReward);
      tx.user.updateMany.mockResolvedValue({ count: 1 });
      tx.reward.updateMany.mockResolvedValue({ count: 1 });
      tx.rewardRedemption.create.mockResolvedValue(pendingRedemption);
      tx.pointEvent.create.mockResolvedValue(undefined);

      const result = await service.redeem('reward-1', 'user-1');

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
          stock: { gt: 0 },
        },
        data: {
          stock: { decrement: 1 },
        },
      });
      expect(tx.rewardRedemption.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          rewardId: 'reward-1',
          pointsSpent: 50,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          reward: true,
        },
      });
      expect(tx.pointEvent.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          points: -50,
          kind: PointEventKind.DEBIT,
          source: PointEventSource.REWARD_REDEMPTION,
          description: 'Resgate de recompensa: Camiseta Semcomp',
        },
      });
      expect(result).toEqual(pendingRedemption);
    });

    it('rejects redeem when the user does not have enough points', async () => {
      const { service, tx } = createService();

      tx.reward.findUnique.mockResolvedValue(activeReward);
      tx.user.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.redeem('reward-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(tx.reward.updateMany).not.toHaveBeenCalled();
      expect(tx.rewardRedemption.create).not.toHaveBeenCalled();
    });

    it('rejects redeem when stock is exhausted concurrently', async () => {
      const { service, tx } = createService();

      tx.reward.findUnique.mockResolvedValue(activeReward);
      tx.user.updateMany.mockResolvedValue({ count: 1 });
      tx.reward.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.redeem('reward-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(tx.rewardRedemption.create).not.toHaveBeenCalled();
    });
  });

  describe('cancelRedemption', () => {
    it('returns points and stock for pending redemptions without changing xp', async () => {
      const { service, tx } = createService();

      tx.rewardRedemption.findUnique.mockResolvedValue(pendingRedemption);
      tx.rewardRedemption.update.mockResolvedValue({
        ...pendingRedemption,
        status: 'CANCELLED',
      });
      tx.user.update.mockResolvedValue(undefined);
      tx.reward.update.mockResolvedValue(undefined);
      tx.pointEvent.create.mockResolvedValue(undefined);

      await service.cancelRedemption('redemption-1');

      expect(tx.rewardRedemption.update).toHaveBeenCalledWith({
        where: { id: 'redemption-1' },
        data: { status: 'CANCELLED' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          reward: true,
        },
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
        },
      });
    });

    it('rejects cancel when redemption is not pending', async () => {
      const { service, tx } = createService();

      tx.rewardRedemption.findUnique.mockResolvedValue({
        ...pendingRedemption,
        status: 'DELIVERED',
      });

      await expect(service.cancelRedemption('redemption-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  it('creates rewards with normalized optional fields', async () => {
    const { service, prisma } = createService();
    prisma.reward.create.mockResolvedValue(activeReward);

    await service.create({
      name: ' Camiseta Semcomp ',
      description: ' ',
      costInPoints: 50,
      stock: 3,
      imageUrl: '',
      isActive: true,
    });

    expect(prisma.reward.create).toHaveBeenCalledWith({
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

  it('lists pending redemptions for admin operation', async () => {
    const { service, prisma } = createService();
    prisma.rewardRedemption.findMany.mockResolvedValue([pendingRedemption]);

    await expect(service.findPendingRedemptions()).resolves.toEqual([
      pendingRedemption,
    ]);
    expect(prisma.rewardRedemption.findMany).toHaveBeenCalledWith({
      where: { status: 'PENDING' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        reward: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('marks pending redemptions as delivered', async () => {
    const { service, tx } = createService();
    tx.rewardRedemption.findUnique.mockResolvedValue(pendingRedemption);
    tx.rewardRedemption.update.mockResolvedValue({
      ...pendingRedemption,
      status: 'DELIVERED',
    });

    await expect(
      service.deliverRedemption('redemption-1'),
    ).resolves.toMatchObject({
      status: 'DELIVERED',
    });
  });

  it('throws NotFoundException when reward does not exist', async () => {
    const { service, tx } = createService();
    tx.reward.findUnique.mockResolvedValue(null);

    await expect(service.redeem('missing', 'user-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
