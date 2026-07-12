import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PointEventKind,
  PointEventSource,
  RedemptionStatus,
  Prisma,
} from '@prisma/client';
import { paginate } from '../common/dto/pagination-response.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRewardDto } from './dto/create-reward.dto';
import { UpdateRewardDto } from './dto/update-reward.dto';
import {
  AdminRewardsQueryDto,
  AdminRewardStatusFilter,
} from './dto/admin-rewards-query.dto';
import {
  AdminRedemptionsQueryDto,
  AdminRedemptionStatusFilter,
} from './dto/admin-redemptions-query.dto';

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
  user: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  reward: true,
} as const;

@Injectable()
export class RewardsService {
  constructor(private readonly prisma: PrismaService) {}

  create(createRewardDto: CreateRewardDto) {
    return this.prisma.reward.create({
      data: {
        name: createRewardDto.name.trim(),
        description: normalizeOptionalText(createRewardDto.description),
        costInPoints: createRewardDto.costInPoints,
        stock: createRewardDto.stock,
        imageUrl: normalizeOptionalText(createRewardDto.imageUrl),
        isActive: createRewardDto.isActive,
      },
      select: rewardSelect,
    });
  }

  findAll() {
    return this.prisma.reward.findMany({
      where: { isActive: true },
      select: rewardSelect,
      orderBy: [{ isActive: 'desc' }, { stock: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async findAdminRewards(query: AdminRewardsQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.RewardWhereInput = {};
    if (query.status === AdminRewardStatusFilter.ACTIVE) where.isActive = true;
    if (query.status === AdminRewardStatusFilter.INACTIVE)
      where.isActive = false;
    if (query.status === AdminRewardStatusFilter.OUT_OF_STOCK) {
      where.isActive = true;
      where.stock = 0;
    }
    if (search)
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    const [total, rows] = await Promise.all([
      this.prisma.reward.count({ where }),
      this.prisma.reward.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: rewardSelect,
      }),
    ]);
    const counts = rows.length
      ? await this.prisma.rewardRedemption.groupBy({
          by: ['rewardId', 'status'],
          where: { rewardId: { in: rows.map(({ id }) => id) } },
          _count: { _all: true },
        })
      : [];
    const countMap = new Map(
      counts.map((entry) => [
        `${entry.rewardId}:${entry.status}`,
        entry._count._all,
      ]),
    );
    return paginate(
      rows.map((reward) => ({
        ...reward,
        redemptionCounts: {
          PENDING:
            countMap.get(`${reward.id}:${RedemptionStatus.PENDING}`) ?? 0,
          DELIVERED:
            countMap.get(`${reward.id}:${RedemptionStatus.DELIVERED}`) ?? 0,
          CANCELLED:
            countMap.get(`${reward.id}:${RedemptionStatus.CANCELLED}`) ?? 0,
        },
      })),
      total,
      query.page,
      query.limit,
    );
  }

  async findRedemptions(query: AdminRedemptionsQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.RewardRedemptionWhereInput = {
      ...(query.status !== AdminRedemptionStatusFilter.ALL && {
        status: mapRedemptionStatus(query.status),
      }),
      ...(query.rewardId && { rewardId: query.rewardId }),
      ...(search && {
        user: {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        },
      }),
    };
    const select = {
      id: true,
      userId: true,
      rewardId: true,
      pointsSpent: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, name: true, email: true } },
      reward: { select: rewardSelect },
    } as const;
    const [total, rows] = await Promise.all([
      this.prisma.rewardRedemption.count({ where }),
      this.prisma.rewardRedemption.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select,
      }),
    ]);
    return paginate(rows, total, query.page, query.limit);
  }

  findById(id: string) {
    return this.prisma.reward.findUnique({
      where: { id },
      select: rewardSelect,
    });
  }

  async update(id: string, updateRewardDto: UpdateRewardDto) {
    const reward = await this.findById(id);

    if (!reward) {
      throw new NotFoundException('Recompensa não encontrada.');
    }

    return this.prisma.reward.update({
      where: { id },
      data: normalizeRewardInput(updateRewardDto),
      select: rewardSelect,
    });
  }

  async redeem(rewardId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const reward = await tx.reward.findUnique({
        where: { id: rewardId },
        select: rewardSelect,
      });

      if (!reward) {
        throw new NotFoundException('Recompensa não encontrada.');
      }

      if (!reward.isActive) {
        throw new BadRequestException('Esta recompensa está inativa.');
      }

      if (reward.stock <= 0) {
        throw new BadRequestException('Esta recompensa está esgotada.');
      }

      const userUpdate = await tx.user.updateMany({
        where: {
          id: userId,
          points: { gte: reward.costInPoints },
        },
        data: {
          points: { decrement: reward.costInPoints },
        },
      });

      if (userUpdate.count === 0) {
        throw new BadRequestException(
          'Você não tem points suficientes para resgatar esta recompensa.',
        );
      }

      const rewardUpdate = await tx.reward.updateMany({
        where: {
          id: reward.id,
          isActive: true,
          stock: { gt: 0 },
        },
        data: {
          stock: { decrement: 1 },
        },
      });

      if (rewardUpdate.count === 0) {
        throw new BadRequestException('Esta recompensa está indisponível.');
      }

      const redemption = await tx.rewardRedemption.create({
        data: {
          userId,
          rewardId: reward.id,
          pointsSpent: reward.costInPoints,
        },
        include: redemptionInclude,
      });

      await tx.pointEvent.create({
        data: {
          userId,
          points: -reward.costInPoints,
          kind: PointEventKind.DEBIT,
          source: PointEventSource.REWARD_REDEMPTION,
          description: `Resgate de recompensa: ${reward.name}`,
        },
      });

      return redemption;
    });
  }

  findPendingRedemptions() {
    return this.prisma.rewardRedemption.findMany({
      where: { status: RedemptionStatus.PENDING },
      include: redemptionInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  async deliverRedemption(redemptionId: string) {
    return this.prisma.$transaction(async (tx) => {
      const redemption = await tx.rewardRedemption.findUnique({
        where: { id: redemptionId },
        include: redemptionInclude,
      });

      assertPendingRedemption(redemption);

      await transitionPendingRedemption(
        tx.rewardRedemption,
        redemptionId,
        RedemptionStatus.DELIVERED,
      );

      const delivered = await tx.rewardRedemption.findUnique({
        where: { id: redemptionId },
        include: redemptionInclude,
      });

      if (!delivered) {
        throw new NotFoundException('Resgate de recompensa não encontrado.');
      }

      return delivered;
    });
  }

  async cancelRedemption(redemptionId: string) {
    return this.prisma.$transaction(async (tx) => {
      const redemption = await tx.rewardRedemption.findUnique({
        where: { id: redemptionId },
        include: redemptionInclude,
      });

      assertPendingRedemption(redemption);

      await transitionPendingRedemption(
        tx.rewardRedemption,
        redemptionId,
        RedemptionStatus.CANCELLED,
      );

      await tx.user.update({
        where: { id: redemption.userId },
        data: { points: { increment: redemption.pointsSpent } },
      });

      await tx.reward.update({
        where: { id: redemption.rewardId },
        data: { stock: { increment: 1 } },
      });

      await tx.pointEvent.create({
        data: {
          userId: redemption.userId,
          points: redemption.pointsSpent,
          kind: PointEventKind.CREDIT,
          source: PointEventSource.REWARD_REDEMPTION,
          description: `Cancelamento de recompensa: ${redemption.reward.name}`,
        },
      });

      const cancelled = await tx.rewardRedemption.findUnique({
        where: { id: redemptionId },
        include: redemptionInclude,
      });

      if (!cancelled) {
        throw new NotFoundException('Resgate de recompensa não encontrado.');
      }

      return cancelled;
    });
  }
}

function mapRedemptionStatus(status: AdminRedemptionStatusFilter) {
  const statuses: Record<
    Exclude<AdminRedemptionStatusFilter, AdminRedemptionStatusFilter.ALL>,
    RedemptionStatus
  > = {
    [AdminRedemptionStatusFilter.PENDING]: RedemptionStatus.PENDING,
    [AdminRedemptionStatusFilter.DELIVERED]: RedemptionStatus.DELIVERED,
    [AdminRedemptionStatusFilter.CANCELLED]: RedemptionStatus.CANCELLED,
  };
  return statuses[
    status as Exclude<
      AdminRedemptionStatusFilter,
      AdminRedemptionStatusFilter.ALL
    >
  ];
}

function normalizeRewardInput(input: CreateRewardDto | UpdateRewardDto) {
  return {
    name: input.name?.trim(),
    description: normalizeOptionalText(input.description),
    costInPoints: input.costInPoints,
    stock: input.stock,
    imageUrl: normalizeOptionalText(input.imageUrl),
    isActive: input.isActive,
  };
}

async function transitionPendingRedemption(
  rewardRedemption: {
    updateMany: (args: {
      where: { id: string; status: RedemptionStatus };
      data: { status: RedemptionStatus };
    }) => Promise<{ count: number }>;
  },
  redemptionId: string,
  status: RedemptionStatus,
) {
  const result = await rewardRedemption.updateMany({
    where: { id: redemptionId, status: RedemptionStatus.PENDING },
    data: { status },
  });

  if (result.count === 0) {
    throw new BadRequestException(
      'Apenas resgates pendentes podem mudar de status.',
    );
  }
}

function normalizeOptionalText(value: string | null | undefined) {
  if (value == null) {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

function assertPendingRedemption<T extends { status: RedemptionStatus } | null>(
  redemption: T,
): asserts redemption is Exclude<T, null> {
  if (!redemption) {
    throw new NotFoundException('Resgate de recompensa não encontrado.');
  }

  if (redemption.status !== RedemptionStatus.PENDING) {
    throw new BadRequestException(
      'Apenas resgates pendentes podem mudar de status.',
    );
  }
}
