import { Injectable } from '@nestjs/common';
import { PointEventSource, Prisma, RedemptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const rewardSelect = {
  id: true,
  name: true,
  description: true,
  costInPoints: true,
  stock: true,
  isActive: true,
  imageUrl: true,
  createdAt: true,
  updatedAt: true,
} as const;

const redemptionInclude = {
  user: { select: { id: true, name: true, email: true } },
  reward: true,
} as const;

type RewardsDatabase = Pick<
  Prisma.TransactionClient,
  'reward' | 'rewardRedemption' | 'pointEvent' | 'user'
>;

export interface RewardWriteInput {
  name?: string;
  description?: string | null;
  costInPoints?: number;
  stock?: number;
  imageUrl?: string | null;
  isActive?: boolean;
}

export interface RewardPageFilter {
  page: number;
  limit: number;
  search?: string;
  state?: 'active' | 'inactive' | 'out-of-stock';
}

export interface RedemptionPageFilter {
  page: number;
  limit: number;
  search?: string;
  rewardId?: string;
  status?: RedemptionState;
}

export type RedemptionState = 'PENDING' | 'DELIVERED' | 'CANCELLED';

@Injectable()
export class RewardsRepository {
  private client: RewardsDatabase;

  constructor(private prisma: PrismaService) {
    this.client = prisma;
  }

  withTransaction<T>(
    callback: (
      repository: RewardsRepository,
      transaction: Prisma.TransactionClient,
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction((tx) =>
      callback(this.transactional(tx), tx),
    );
  }

  createReward(
    input: Required<Pick<RewardWriteInput, 'name' | 'costInPoints' | 'stock'>> &
      RewardWriteInput,
  ) {
    return this.client.reward.create({ data: input, select: rewardSelect });
  }

  findActiveRewards() {
    return this.client.reward.findMany({
      where: { isActive: true },
      select: rewardSelect,
      orderBy: [{ isActive: 'desc' }, { stock: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async findAdminRewardPage(filter: RewardPageFilter) {
    const where: Prisma.RewardWhereInput = {};
    if (filter.state === 'active') where.isActive = true;
    if (filter.state === 'inactive') where.isActive = false;
    if (filter.state === 'out-of-stock') {
      where.isActive = true;
      where.stock = 0;
    }
    if (filter.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.client.reward.count({ where }),
      this.client.reward.findMany({
        where,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        orderBy: { createdAt: 'desc' },
        select: rewardSelect,
      }),
    ]);
    return { rows, total };
  }

  async findRewardRedemptionCounts(rewardIds: string[]): Promise<
    Array<{
      rewardId: string;
      status: RedemptionState;
      _count: { _all: number };
    }>
  > {
    if (!rewardIds.length) return [];
    const counts: unknown = await this.client.rewardRedemption.groupBy({
      by: ['rewardId', 'status'],
      where: { rewardId: { in: rewardIds } },
      _count: { _all: true },
    });
    return counts as Array<{
      rewardId: string;
      status: RedemptionState;
      _count: { _all: number };
    }>;
  }

  async findRedemptionPage(filter: RedemptionPageFilter) {
    const where: Prisma.RewardRedemptionWhereInput = {
      ...(filter.status && { status: filter.status }),
      ...(filter.rewardId && { rewardId: filter.rewardId }),
      ...(filter.search && {
        user: {
          OR: [
            { name: { contains: filter.search, mode: 'insensitive' } },
            { email: { contains: filter.search, mode: 'insensitive' } },
          ],
        },
      }),
    };
    const [total, rows] = await Promise.all([
      this.client.rewardRedemption.count({ where }),
      this.client.rewardRedemption.findMany({
        where,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          userId: true,
          rewardId: true,
          pointsSpent: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, name: true, email: true } },
          reward: { select: rewardSelect },
        },
      }),
    ]);
    return { rows, total };
  }

  findRewardById(id: string) {
    return this.client.reward.findUnique({
      where: { id },
      select: rewardSelect,
    });
  }

  updateReward(id: string, input: RewardWriteInput) {
    return this.client.reward.update({
      where: { id },
      data: input,
      select: rewardSelect,
    });
  }

  debitUserPoints(userId: string, points: number) {
    return this.client.user.updateMany({
      where: { id: userId, points: { gte: points } },
      data: { points: { decrement: points } },
    });
  }

  creditUserPoints(userId: string, points: number) {
    return this.client.user.update({
      where: { id: userId },
      data: { points: { increment: points } },
    });
  }

  decrementRewardStock(rewardId: string) {
    return this.client.reward.updateMany({
      where: { id: rewardId, isActive: true, stock: { gt: 0 } },
      data: { stock: { decrement: 1 } },
    });
  }

  incrementRewardStock(rewardId: string) {
    return this.client.reward.update({
      where: { id: rewardId },
      data: { stock: { increment: 1 } },
    });
  }

  createRedemption(userId: string, rewardId: string, pointsSpent: number) {
    return this.client.rewardRedemption.create({
      data: { userId, rewardId, pointsSpent },
      include: redemptionInclude,
    });
  }

  createRewardPointEvent(input: {
    userId: string;
    points: number;
    kind: 'CREDIT' | 'DEBIT';
    description: string;
  }) {
    return this.client.pointEvent.create({
      data: {
        ...input,
        source: PointEventSource.REWARD_REDEMPTION,
      },
    });
  }

  findPendingRedemptions() {
    return this.client.rewardRedemption.findMany({
      where: { status: RedemptionStatus.PENDING },
      include: redemptionInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  findRedemptionById(id: string) {
    return this.client.rewardRedemption.findUnique({
      where: { id },
      include: redemptionInclude,
    });
  }

  transitionRedemption(id: string, status: RedemptionState) {
    return this.client.rewardRedemption.updateMany({
      where: { id, status: RedemptionStatus.PENDING },
      data: { status },
    });
  }

  private transactional(tx: Prisma.TransactionClient) {
    const repository = Object.create(
      RewardsRepository.prototype,
    ) as RewardsRepository;
    repository.prisma = this.prisma;
    repository.client = tx;
    return repository;
  }
}
