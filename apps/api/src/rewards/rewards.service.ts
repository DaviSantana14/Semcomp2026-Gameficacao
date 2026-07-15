import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { paginate } from '../common/dto/pagination-response.dto';
import {
  RedemptionPageFilter,
  RedemptionState,
  RewardsRepository,
  RewardWriteInput,
} from './rewards.repository';
import {
  AdminRedemptionsQueryDto,
  AdminRedemptionStatusFilter,
} from './dto/admin-redemptions-query.dto';
import {
  AdminRewardsQueryDto,
  AdminRewardStatusFilter,
} from './dto/admin-rewards-query.dto';
import { CreateRewardDto } from './dto/create-reward.dto';
import { UpdateRewardDto } from './dto/update-reward.dto';
import { RedemptionTransitionDto } from './dto/redemption-transition.dto';
import { AdminOperationContext } from '../common/request-context';
import { AuditService } from '../audit/audit.service';
import {
  AuditActorType,
  AuditEntityType,
  AuditOperation,
} from '../audit/audit.repository';

@Injectable()
export class RewardsService {
  constructor(
    private readonly repository: RewardsRepository,
    private readonly audit: AuditService,
  ) {}

  create(dto: CreateRewardDto, context: AdminOperationContext) {
    return this.repository.withTransaction(async (repository) => {
      const reward = await repository.createReward({
        name: dto.name.trim(),
        description: normalizeOptionalText(dto.description),
        costInPoints: dto.costInPoints,
        stock: dto.stock,
        imageUrl: normalizeOptionalText(dto.imageUrl),
        isActive: dto.isActive,
      });
      await this.audit.record(repository.auditWriter!, {
        actor: { actorType: AuditActorType.ADMIN, ...context },
        operation: AuditOperation.REWARD_CREATED,
        entityType: AuditEntityType.REWARD,
        entityId: reward.id,
        reason: dto.reason,
        before: null,
        after: toRewardAuditSnapshot(reward),
      });
      return reward;
    });
  }

  findAll() {
    return this.repository.findActiveRewards();
  }

  async findAdminRewards(query: AdminRewardsQueryDto) {
    const state =
      query.status === AdminRewardStatusFilter.ACTIVE
        ? 'active'
        : query.status === AdminRewardStatusFilter.INACTIVE
          ? 'inactive'
          : query.status === AdminRewardStatusFilter.OUT_OF_STOCK
            ? 'out-of-stock'
            : undefined;
    const page = await this.repository.findAdminRewardPage({
      page: query.page,
      limit: query.limit,
      search: query.search?.trim(),
      state,
    });
    const counts = await this.repository.findRewardRedemptionCounts(
      page.rows.map((reward) => reward.id),
    );
    const countMap = new Map(
      counts.map(
        (entry) =>
          [`${entry.rewardId}:${entry.status}`, entry._count._all] as const,
      ),
    );
    return paginate(
      page.rows.map((reward) => ({
        ...reward,
        redemptionCounts: {
          PENDING: countMap.get(`${reward.id}:PENDING`) ?? 0,
          DELIVERED: countMap.get(`${reward.id}:DELIVERED`) ?? 0,
          CANCELLED: countMap.get(`${reward.id}:CANCELLED`) ?? 0,
        },
      })),
      page.total,
      query.page,
      query.limit,
    );
  }

  async findRedemptions(query: AdminRedemptionsQueryDto) {
    const filter: RedemptionPageFilter = {
      page: query.page,
      limit: query.limit,
      search: query.search?.trim(),
      rewardId: query.rewardId,
      status: mapRedemptionStatus(query.status),
    };
    const page = await this.repository.findRedemptionPage(filter);
    return paginate(page.rows, page.total, query.page, query.limit);
  }

  findById(id: string) {
    return this.repository.findRewardById(id);
  }

  update(id: string, dto: UpdateRewardDto, context: AdminOperationContext) {
    return this.repository.withTransaction(async (repository) => {
      const current = await repository.findRewardById(id);
      if (!current) throw new NotFoundException('Recompensa não encontrada.');
      const candidate = normalizeRewardInput(dto);
      const input = Object.fromEntries(
        Object.entries(candidate).filter(
          ([key, value]) =>
            value !== undefined &&
            current[key as keyof typeof current] !== value,
        ),
      ) as RewardWriteInput;
      const changed = Object.keys(input);
      if (!changed.length) return current;
      const updated = await repository.updateReward(id, input);
      const statusOnly = changed.length === 1 && changed[0] === 'isActive';
      if (statusOnly) {
        await this.audit.record(repository.auditWriter!, {
          actor: { actorType: AuditActorType.ADMIN, ...context },
          operation: AuditOperation.REWARD_STATUS_CHANGED,
          entityType: AuditEntityType.REWARD,
          entityId: id,
          reason: dto.reason,
          before: { isActive: current.isActive },
          after: { isActive: updated.isActive },
        });
      } else {
        await this.audit.record(repository.auditWriter!, {
          actor: { actorType: AuditActorType.ADMIN, ...context },
          operation: AuditOperation.REWARD_UPDATED,
          entityType: AuditEntityType.REWARD,
          entityId: id,
          reason: dto.reason,
          before: toRewardAuditSnapshot(current),
          after: toRewardAuditSnapshot(updated),
        });
      }
      return updated;
    });
  }

  redeem(rewardId: string, userId: string) {
    return this.repository.withTransaction(async (repository) => {
      const reward = await repository.findRewardById(rewardId);
      if (!reward) throw new NotFoundException('Recompensa não encontrada.');
      if (!reward.isActive) {
        throw new BadRequestException('Esta recompensa está inativa.');
      }
      if (reward.stock <= 0) {
        throw new BadRequestException('Esta recompensa está esgotada.');
      }
      if (
        (await repository.debitUserPoints(userId, reward.costInPoints))
          .count === 0
      ) {
        throw new BadRequestException(
          'Você não tem points suficientes para resgatar esta recompensa.',
        );
      }
      if ((await repository.decrementRewardStock(reward.id)).count === 0) {
        throw new BadRequestException('Esta recompensa está indisponível.');
      }
      const redemption = await repository.createRedemption(
        userId,
        reward.id,
        reward.costInPoints,
      );
      await repository.createRewardPointEvent({
        userId,
        points: -reward.costInPoints,
        kind: 'DEBIT',
        description: `Resgate de recompensa: ${reward.name}`,
        rewardRedemptionId: redemption.id,
      });
      return redemption;
    });
  }

  findPendingRedemptions() {
    return this.repository.findPendingRedemptions();
  }

  deliverRedemption(
    redemptionId: string,
    dto: RedemptionTransitionDto,
    context: AdminOperationContext,
  ) {
    return this.repository.withTransaction(async (repository) => {
      const redemption = this.assertPending(
        await repository.lockRedemptionState(redemptionId),
      );
      const transitionedAt = new Date();
      await this.transition(
        repository,
        redemptionId,
        'DELIVERED',
        context.actorAdminId,
        transitionedAt,
      );
      const delivered = await repository.findRedemptionById(redemptionId);
      if (!delivered) {
        throw new NotFoundException('Resgate de recompensa não encontrado.');
      }
      await this.audit.record(repository.auditWriter!, {
        actor: { actorType: AuditActorType.ADMIN, ...context },
        operation: AuditOperation.REWARD_REDEMPTION_DELIVERED,
        entityType: AuditEntityType.REWARD_REDEMPTION,
        entityId: redemptionId,
        participantId: redemption.userId,
        reason: dto.reason,
        before: {
          id: redemptionId,
          status: redemption.status,
          deliveredAt: redemption.deliveredAt ?? null,
          deliveredByAdminId: redemption.deliveredByAdminId ?? null,
        },
        after: {
          id: redemptionId,
          status: delivered.status,
          deliveredAt: delivered.deliveredAt!,
          deliveredByAdminId: delivered.deliveredByAdminId!,
        },
        metadata: { rewardRedemptionId: redemptionId },
      });
      return delivered;
    });
  }

  cancelRedemption(
    redemptionId: string,
    dto: RedemptionTransitionDto,
    context: AdminOperationContext,
  ) {
    return this.repository.withTransaction(async (repository) => {
      const redemption = this.assertPending(
        await repository.lockCancellationState(redemptionId),
      );
      const transitionedAt = new Date();
      await this.transition(
        repository,
        redemptionId,
        'CANCELLED',
        context.actorAdminId,
        transitionedAt,
      );
      const user = await repository.creditUserPoints(
        redemption.userId,
        redemption.pointsSpent,
      );
      const reward = await repository.incrementRewardStock(redemption.rewardId);
      const refund = await repository.createRewardPointEvent({
        userId: redemption.userId,
        points: redemption.pointsSpent,
        kind: 'CREDIT',
        description: `Cancelamento de recompensa: ${redemption.reward.name}`,
        rewardRedemptionId: redemptionId,
      });
      const cancelled = await repository.findRedemptionById(redemptionId);
      if (!cancelled) {
        throw new NotFoundException('Resgate de recompensa não encontrado.');
      }
      await this.audit.record(repository.auditWriter!, {
        actor: { actorType: AuditActorType.ADMIN, ...context },
        operation: AuditOperation.REWARD_REDEMPTION_CANCELLED,
        entityType: AuditEntityType.REWARD_REDEMPTION,
        entityId: redemptionId,
        participantId: redemption.userId,
        reason: dto.reason,
        before: {
          id: redemptionId,
          status: redemption.status,
          stock: redemption.reward.stock,
          points: redemption.user.points,
        },
        after: {
          id: redemptionId,
          status: cancelled.status,
          stock: reward.stock,
          points: user.points,
          cancelledAt: cancelled.cancelledAt!,
          cancelledByAdminId: cancelled.cancelledByAdminId!,
          pointEventId: refund.id,
        },
        metadata: { rewardRedemptionId: redemptionId, pointEventId: refund.id },
      });
      return cancelled;
    });
  }

  private assertPending<T extends { status: RedemptionState }>(
    redemption: T | null,
  ): T {
    if (!redemption) {
      throw new NotFoundException('Resgate de recompensa não encontrado.');
    }
    if (redemption.status !== 'PENDING') {
      throw new BadRequestException(
        'Apenas resgates pendentes podem mudar de status.',
      );
    }
    return redemption;
  }

  private async transition(
    repository: RewardsRepository,
    id: string,
    status: RedemptionState,
    adminId: string,
    transitionedAt: Date,
  ) {
    if (
      (
        await repository.transitionRedemption(
          id,
          status,
          adminId,
          transitionedAt,
        )
      ).count === 0
    ) {
      throw new ConflictException(
        'Apenas resgates pendentes podem mudar de status.',
      );
    }
  }
}

function mapRedemptionStatus(status: AdminRedemptionStatusFilter) {
  if (status === AdminRedemptionStatusFilter.ALL) return undefined;
  return {
    [AdminRedemptionStatusFilter.PENDING]: 'PENDING' as const,
    [AdminRedemptionStatusFilter.DELIVERED]: 'DELIVERED' as const,
    [AdminRedemptionStatusFilter.CANCELLED]: 'CANCELLED' as const,
  }[status];
}

function normalizeRewardInput(input: UpdateRewardDto): RewardWriteInput {
  return {
    name: input.name?.trim(),
    description: normalizeNullableText(input.description),
    costInPoints: input.costInPoints,
    stock: input.stock,
    imageUrl: normalizeNullableText(input.imageUrl),
    isActive: input.isActive,
  };
}

function toRewardAuditSnapshot(reward: {
  id: string;
  name: string;
  description: string | null;
  costInPoints: number;
  stock: number;
  isActive: boolean;
}) {
  return {
    id: reward.id,
    name: reward.name,
    description: reward.description,
    costInPoints: reward.costInPoints,
    stock: reward.stock,
    isActive: reward.isActive,
  };
}

function normalizeNullableText(value: string | null | undefined) {
  return value == null ? value : value.trim();
}

function normalizeOptionalText(value: string | null | undefined) {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}
