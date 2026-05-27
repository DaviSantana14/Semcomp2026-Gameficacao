import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PointEventKind,
  PointEventSource,
  RedemptionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRewardDto } from './dto/create-reward.dto';
import { UpdateRewardDto } from './dto/update-reward.dto';

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
          stock: { gt: 0 },
        },
        data: {
          stock: { decrement: 1 },
        },
      });

      if (rewardUpdate.count === 0) {
        throw new BadRequestException('Esta recompensa está esgotada.');
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
