import { Injectable, Optional } from '@nestjs/common';
import { PointEventSource, Prisma, RedemptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuditRepository,
  TransactionAuditWriter,
} from '../audit/audit.repository';

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
  user: { select: { id: true, name: true, email: true, points: true } },
  reward: { select: rewardSelect },
  pointEvents: {
    select: {
      id: true,
      points: true,
      xpDelta: true,
      kind: true,
      source: true,
      rewardRedemptionId: true,
      description: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

type RewardsDatabase = Pick<
  Prisma.TransactionClient,
  'reward' | 'rewardRedemption' | 'pointEvent' | 'user' | '$queryRaw'
>;

export type LockedRedemptionState = {
  id: string;
  userId: string;
  rewardId: string;
  pointsSpent: number;
  status: RedemptionState;
  deliveredAt: Date | null;
  deliveredByAdminId: string | null;
  cancelledAt: Date | null;
  cancelledByAdminId: string | null;
};

export type LockedCancellationState = LockedRedemptionState & {
  user: { id: string; points: number };
  reward: { id: string; name: string; stock: number };
};

export type LockedRewardState = {
  id: string;
  name: string;
  description: string | null;
  costInPoints: number;
  stock: number;
  isActive: boolean;
  imageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

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

export interface RedemptionFilter {
  search?: string;
  rewardId?: string;
  status?: RedemptionState;
  from?: Date;
  to?: Date;
}

export interface RedemptionPageFilter extends RedemptionFilter {
  page: number;
  limit: number;
}

export type RedemptionState = 'PENDING' | 'DELIVERED' | 'CANCELLED';

export function buildRedemptionWhere(
  filter: RedemptionFilter,
): Prisma.RewardRedemptionWhereInput {
  const where: Prisma.RewardRedemptionWhereInput = {
    ...(filter.status && { status: filter.status }),
    ...(filter.rewardId && { rewardId: filter.rewardId }),
    ...(filter.search?.trim() && {
      user: {
        OR: [
          {
            name: {
              contains: filter.search.trim(),
              mode: 'insensitive',
            },
          },
          {
            email: {
              contains: filter.search.trim(),
              mode: 'insensitive',
            },
          },
        ],
      },
    }),
    ...((filter.from || filter.to) && {
      createdAt: {
        ...(filter.from && { gte: filter.from }),
        ...(filter.to && { lt: filter.to }),
      },
    }),
  };
  return where;
}

@Injectable()
export class RewardsRepository {
  private client: RewardsDatabase;
  auditWriter?: TransactionAuditWriter;

  constructor(
    private prisma: PrismaService,
    @Optional() private auditRepository?: AuditRepository,
  ) {
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
    const where = buildRedemptionWhere(filter);
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
          deliveredAt: true,
          deliveredByAdminId: true,
          cancelledAt: true,
          cancelledByAdminId: true,
          user: { select: { id: true, name: true, email: true } },
          reward: { select: rewardSelect },
          pointEvents: redemptionInclude.pointEvents,
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

  async lockRewardState(id: string): Promise<LockedRewardState | null> {
    const rows = await this.client.$queryRaw<LockedRewardState[]>`
      SELECT "id", "name", "description", "costInPoints", "stock",
             "isActive", "imageUrl", "createdAt", "updatedAt"
      FROM "Reward"
      WHERE "id" = ${id}
      FOR UPDATE
    `;
    return rows[0] ?? null;
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
    rewardRedemptionId: string;
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

  async lockRedemptionState(id: string) {
    const rows = await this.client.$queryRaw<LockedRedemptionState[]>`
      SELECT "id", "userId", "rewardId", "pointsSpent", "status",
             "deliveredAt", "deliveredByAdminId", "cancelledAt",
             "cancelledByAdminId"
      FROM "RewardRedemption"
      WHERE "id" = ${id}
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  async lockCancellationState(
    id: string,
  ): Promise<LockedCancellationState | null> {
    const redemption = await this.lockRedemptionState(id);
    if (!redemption) return null;

    // Shared purchase/cancellation rows are always locked User -> Reward.
    const users = await this.client.$queryRaw<
      Array<{ id: string; points: number }>
    >`
      SELECT "id", "points"
      FROM "User"
      WHERE "id" = ${redemption.userId}
      FOR UPDATE
    `;
    const rewards = await this.client.$queryRaw<
      Array<{ id: string; name: string; stock: number }>
    >`
      SELECT "id", "name", "stock"
      FROM "Reward"
      WHERE "id" = ${redemption.rewardId}
      FOR UPDATE
    `;
    if (!users[0] || !rewards[0]) return null;
    return { ...redemption, user: users[0], reward: rewards[0] };
  }

  transitionRedemption(
    id: string,
    status: RedemptionState,
    adminId: string,
    transitionedAt: Date,
  ) {
    return this.client.rewardRedemption.updateMany({
      where: { id, status: RedemptionStatus.PENDING },
      data: {
        status,
        ...(status === 'DELIVERED'
          ? { deliveredAt: transitionedAt, deliveredByAdminId: adminId }
          : { cancelledAt: transitionedAt, cancelledByAdminId: adminId }),
      },
    });
  }

  private transactional(tx: Prisma.TransactionClient) {
    const repository = Object.create(
      RewardsRepository.prototype,
    ) as RewardsRepository;
    repository.prisma = this.prisma;
    repository.auditRepository = this.auditRepository;
    repository.client = tx;
    repository.auditWriter = this.auditRepository?.bindTransaction(tx);
    return repository;
  }
}
