import { Injectable, NotFoundException } from '@nestjs/common';
import { paginate } from '../common/dto/pagination-response.dto';
import { AdminParticipantsRepository } from './admin-participants.repository';
import { AdminParticipantEventsQueryDto } from './dto/admin-participant-events-query.dto';
import {
  AdminParticipantRedemptionsQueryDto,
  AdminParticipantRedemptionStatusFilter,
} from './dto/admin-participant-redemptions-query.dto';
import {
  AdminParticipantsQueryDto,
  ParticipantStatusFilter,
} from './dto/admin-participants-query.dto';
import { UpdateParticipantStatusDto } from './dto/update-participant-status.dto';
import {
  AuditActorType,
  AuditEntityType,
  AuditOperation,
} from '../audit/audit.repository';
import { AuditService } from '../audit/audit.service';
import { AdminOperationContext } from '../common/request-context';

@Injectable()
export class AdminParticipantsService {
  constructor(
    private readonly repository: AdminParticipantsRepository,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: AdminParticipantsQueryDto) {
    const page = await this.repository.findParticipantPage({
      page: query.page,
      limit: query.limit,
      search: query.search?.trim(),
      isActive:
        query.status === undefined
          ? undefined
          : query.status === ParticipantStatusFilter.ACTIVE,
    });
    return paginate(
      page.rows.map(mapParticipant),
      page.total,
      query.page,
      query.limit,
    );
  }

  async updateStatus(
    id: string,
    dto: UpdateParticipantStatusDto,
    context: AdminOperationContext,
  ) {
    await this.repository.withTransaction(async (repository) => {
      const current = await repository.findParticipantStatus(id);
      if (!current) {
        throw new NotFoundException('Participante não encontrado.');
      }
      if (current.isActive === dto.isActive) return;

      const updated = await repository.updateParticipantStatus(
        id,
        dto.isActive,
      );
      await this.audit.record(repository.auditWriter!, {
        actor: { actorType: AuditActorType.ADMIN, ...context },
        operation: AuditOperation.PARTICIPANT_STATUS_CHANGED,
        entityType: AuditEntityType.PARTICIPANT,
        entityId: id,
        participantId: id,
        reason: dto.reason,
        before: { id: current.id, isActive: current.isActive },
        after: { id: updated.id, isActive: updated.isActive },
      });
    });
    return this.findOne(id);
  }

  async findOne(id: string) {
    const participant = await this.repository.findParticipantById(id);
    if (!participant) {
      throw new NotFoundException('Participante não encontrado.');
    }
    const counters = await this.repository.findParticipantCounters(id);
    return {
      ...mapParticipant(participant),
      lastLoginAt: participant.lastLoginAt?.toISOString() ?? null,
      counts: {
        actionRedemptions: counters.actionRedemptions,
        claimCodes: counters.claimCodes,
        movements: counters.movements,
        rewards: Object.fromEntries(
          ['PENDING', 'DELIVERED', 'CANCELLED'].map((status) => [
            status.toLowerCase(),
            counters.rewards.find((row) => row.status === status)?._count
              ._all ?? 0,
          ]),
        ),
      },
    };
  }

  async findPointEvents(id: string, query: AdminParticipantEventsQueryDto) {
    await this.assertParticipant(id);
    const page = await this.repository.findParticipantPointEventPage(id, {
      page: query.page,
      limit: query.limit,
      source:
        query.source && query.source !== 'all'
          ? (query.source.toUpperCase() as
              | 'ACTION_REDEEM'
              | 'REWARD_REDEMPTION'
              | 'ADMIN_GRANT'
              | 'ADMIN_ADJUST')
          : undefined,
      kind:
        query.kind && query.kind !== 'all'
          ? (query.kind.toUpperCase() as 'CREDIT' | 'DEBIT')
          : undefined,
    });
    return paginate(
      page.rows.map((row) => {
        const { auditEventId, reversedEventId, reversal, ...pointEvent } = row;
        return {
          ...pointEvent,
          reversalOfPointEventId: reversedEventId,
          reversalPointEventId: reversal?.id ?? null,
          isAudited: auditEventId !== null,
          origin:
            row.source === 'REWARD_REDEMPTION'
              ? 'REWARD'
              : row.source !== 'ACTION_REDEEM'
                ? 'ADMIN'
                : row.redemptionMethod === 'CLAIM_CODE'
                  ? 'UNIQUE_CODE'
                  : row.redemptionMethod === 'REUSABLE_CODE'
                    ? 'REUSABLE_CODE'
                    : row.redemptionMethod === 'DIRECT'
                      ? 'DIRECT_ACTION'
                      : 'LEGACY_UNKNOWN',
          createdAt: row.createdAt.toISOString(),
        };
      }),
      page.total,
      query.page,
      query.limit,
    );
  }

  async findRewardRedemptions(
    id: string,
    query: AdminParticipantRedemptionsQueryDto,
  ) {
    await this.assertParticipant(id);
    const status =
      query.status &&
      query.status !== AdminParticipantRedemptionStatusFilter.ALL
        ? (
            {
              pending: 'PENDING',
              delivered: 'DELIVERED',
              cancelled: 'CANCELLED',
            } as const
          )[query.status]
        : undefined;
    const page = await this.repository.findParticipantRedemptionPage(id, {
      page: query.page,
      limit: query.limit,
      status,
    });
    return paginate(
      page.rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      page.total,
      query.page,
      query.limit,
    );
  }

  private async assertParticipant(id: string) {
    if (!(await this.repository.participantExists(id))) {
      throw new NotFoundException('Participante não encontrado.');
    }
  }
}

function mapParticipant<
  T extends {
    createdAt: Date;
    updatedAt: Date;
    _count: { pointEvents: number; rewardRedemptions: number };
  },
>(row: T) {
  const { _count, ...participant } = row;
  return {
    ...participant,
    actionRedemptionsCount: _count.pointEvents,
    pendingRewardRedemptionsCount: _count.rewardRedemptions,
    lastLoginAt:
      'lastLoginAt' in row && row.lastLoginAt instanceof Date
        ? row.lastLoginAt.toISOString()
        : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
