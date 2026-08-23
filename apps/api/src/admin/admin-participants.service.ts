import { Injectable, NotFoundException } from '@nestjs/common';
import { paginate } from '../common/dto/pagination-response.dto';
import {
  AdminParticipantsRepository,
  type ParticipantEventPageFilter,
  type PointEventRecord,
} from './admin-participants.repository';
import {
  AdminPointEventKindFilter,
  AdminPointEventMethodFilter,
  AdminPointEventSourceFilter,
  AdminPointEventsQueryDto,
} from './dto/admin-point-events-query.dto';
import { PointEventReferenceType } from './dto/admin-point-event-response.dto';
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
import { maskClaimCode } from '../common/claim-code-mask';
import { parseOperationalDateRange } from '../common/operational-date-range';
import { mapPointEventOrigin } from '../common/point-event-origin';

type KnownPointEventSource = NonNullable<ParticipantEventPageFilter['source']>;
type KnownActionRedemptionMethod =
  | 'DIRECT'
  | 'REUSABLE_CODE'
  | 'CLAIM_CODE'
  | 'LEGACY_UNKNOWN';

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

  async findGlobalPointEvents(query: AdminPointEventsQueryDto) {
    const { from, to } = parseOperationalDateRange(query);
    const page = await this.repository.findPointEventPage({
      page: query.page,
      limit: query.limit,
      search: query.search?.trim() || undefined,
      source:
        query.source && query.source !== AdminPointEventSourceFilter.ALL
          ? (query.source.toUpperCase() as KnownPointEventSource)
          : undefined,
      kind:
        query.kind && query.kind !== AdminPointEventKindFilter.ALL
          ? (query.kind.toUpperCase() as 'CREDIT' | 'DEBIT')
          : undefined,
      method:
        query.method && query.method !== AdminPointEventMethodFilter.ALL
          ? (query.method.toUpperCase() as KnownActionRedemptionMethod)
          : undefined,
      from,
      to,
    });
    return paginate(
      page.rows.map(mapGlobalPointEvent),
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
      const current = await repository.lockParticipantStatus(id);
      if (!current) {
        throw new NotFoundException('Participante não encontrado.');
      }
      if (current.isActive === dto.isActive) return;

      const updated = await repository.updateParticipantStatus(
        id,
        dto.isActive,
      );
      if (!dto.isActive) {
        await repository.revokeOpenSessions(id, new Date());
      }
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
        const {
          auditEventId,
          auditEvent,
          reversedEventId,
          reversal,
          ...pointEvent
        } = row;
        return {
          ...pointEvent,
          reversalOfPointEventId: reversedEventId,
          reversalPointEventId: reversal?.id ?? null,
          isAudited: auditEventId !== null,
          origin: mapPointEventOrigin(
            row.source,
            row.redemptionMethod,
            auditEvent?.operation,
          ),
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

function mapGlobalPointEvent(row: PointEventRecord) {
  const action = row.action
    ? { id: row.action.id, name: row.action.name }
    : null;
  const reward = row.rewardRedemption?.reward ?? null;
  const claimCode = row.claimCode
    ? { id: row.claimCode.id, code: maskClaimCode(row.claimCode.code) }
    : null;
  const rawCode = row.claimCode?.code ?? row.action?.code ?? null;

  return {
    id: row.id,
    participant: row.user,
    points: row.points,
    xpDelta: row.xpDelta,
    kind: row.kind,
    source: row.source,
    redemptionMethod: row.redemptionMethod,
    origin: mapPointEventOrigin(
      row.source,
      row.redemptionMethod,
      row.auditEvent?.operation,
    ),
    isAudited: row.auditEventId !== null,
    action,
    claimCode,
    code: rawCode ? maskClaimCode(rawCode) : null,
    reward,
    reference: mapPointEventReference(row, action, reward),
    actor: row.actorAdmin,
    auditOperation: row.auditEvent?.operation ?? null,
    description: row.description,
    reversalOfPointEventId: row.reversedEventId,
    reversalPointEventId: row.reversal?.id ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapPointEventReference(
  row: PointEventRecord,
  action: { id: string; name: string } | null,
  reward: { id: string; name: string } | null,
) {
  const actionName = action?.name.trim();
  if (actionName) {
    return { type: PointEventReferenceType.ACTION, label: actionName };
  }
  const rewardName = reward?.name.trim();
  if (rewardName) {
    return { type: PointEventReferenceType.REWARD, label: rewardName };
  }
  const auditOperation = row.auditEvent?.operation;
  if (auditOperation) {
    return { type: PointEventReferenceType.AUDIT, label: auditOperation };
  }
  const description = row.description?.trim();
  if (description) {
    return { type: PointEventReferenceType.DESCRIPTION, label: description };
  }
  return {
    type: PointEventReferenceType.POINT_EVENT,
    label: 'Evento de pontos',
  };
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
