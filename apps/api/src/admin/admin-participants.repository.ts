import { Injectable, Optional } from '@nestjs/common';
import {
  ActionRedemptionMethod,
  PointEventKind,
  PointEventSource,
  Prisma,
  RedemptionStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuditRepository,
  TransactionAuditWriter,
} from '../audit/audit.repository';

const participantSelect = {
  id: true,
  name: true,
  cpf: true,
  email: true,
  points: true,
  xp: true,
  level: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      pointEvents: { where: { source: PointEventSource.ACTION_REDEEM } },
      rewardRedemptions: { where: { status: RedemptionStatus.PENDING } },
    },
  },
} as const;

export const pointEventSelect = {
  id: true,
  points: true,
  xpDelta: true,
  kind: true,
  source: true,
  redemptionMethod: true,
  description: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
  action: { select: { id: true, name: true, code: true } },
  claimCode: { select: { id: true, code: true } },
  rewardRedemption: {
    select: {
      id: true,
      reward: { select: { id: true, name: true } },
    },
  },
  auditEventId: true,
  auditEvent: { select: { operation: true } },
  actorAdmin: { select: { id: true, name: true } },
  reversedEventId: true,
  reversal: { select: { id: true } },
} as const;

export type PointEventRecord = Prisma.PointEventGetPayload<{
  select: typeof pointEventSelect;
}>;

export interface ParticipantPageFilter {
  page: number;
  limit: number;
  search?: string;
  isActive?: boolean;
}

export type ParticipantFilter = {
  search?: string;
  isActive?: boolean;
};

export function buildParticipantWhere(
  filter: ParticipantFilter,
): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = { role: UserRole.PARTICIPANT };
  if (filter.isActive !== undefined) where.isActive = filter.isActive;

  const search = filter.search?.trim();
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { cpf: { contains: search } },
    ];
  }
  return where;
}

export interface ParticipantEventPageFilter {
  page: number;
  limit: number;
  source?:
    | 'ACTION_REDEEM'
    | 'REWARD_REDEMPTION'
    | 'ADMIN_GRANT'
    | 'ADMIN_ADJUST';
  kind?: 'CREDIT' | 'DEBIT';
}

export interface ParticipantRedemptionPageFilter {
  page: number;
  limit: number;
  status?: 'PENDING' | 'DELIVERED' | 'CANCELLED';
}

export interface PointEventFilter {
  page: number;
  limit: number;
  search?: string;
  participantId?: string;
  actionId?: string;
  source?: PointEventSource;
  kind?: PointEventKind;
  method?: ActionRedemptionMethod;
  from?: Date;
  to?: Date;
}

export function buildPointEventWhere(
  filter: PointEventFilter,
): Prisma.PointEventWhereInput {
  const where: Prisma.PointEventWhereInput = {
    user: { role: UserRole.PARTICIPANT },
  };
  if (filter.participantId) where.userId = filter.participantId;
  if (filter.actionId) where.actionId = filter.actionId;
  if (filter.source) where.source = filter.source;
  if (filter.kind) where.kind = filter.kind;
  if (filter.method) where.redemptionMethod = filter.method;

  const search = filter.search?.trim();
  if (search) {
    where.user = {
      role: UserRole.PARTICIPANT,
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    };
  }

  if (filter.from || filter.to) {
    where.createdAt = {
      ...(filter.from && { gte: filter.from }),
      ...(filter.to && { lt: filter.to }),
    };
  }
  return where;
}

@Injectable()
export class AdminParticipantsRepository {
  private client: PrismaService | Prisma.TransactionClient;
  auditWriter?: TransactionAuditWriter;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly auditRepository?: AuditRepository,
  ) {
    this.client = prisma;
  }

  withTransaction<T>(
    callback: (repository: AdminParticipantsRepository) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction((tx) => callback(this.transactional(tx)));
  }

  async findParticipantPage(filter: ParticipantPageFilter) {
    const where = buildParticipantWhere(filter);
    const [total, rows] = await Promise.all([
      this.client.user.count({ where }),
      this.client.user.findMany({
        where,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        orderBy: { createdAt: 'desc' },
        select: participantSelect,
      }),
    ]);
    return { rows, total };
  }

  findParticipantStatus(id: string) {
    return this.client.user.findFirst({
      where: { id, role: UserRole.PARTICIPANT },
      select: { id: true, isActive: true },
    });
  }

  async lockParticipantStatus(id: string) {
    const rows = await this.client.$queryRaw<
      Array<{ id: string; isActive: boolean }>
    >(Prisma.sql`
      SELECT "id", "isActive"
      FROM "User"
      WHERE "id" = ${id} AND "role" = 'PARTICIPANT'::"UserRole"
      FOR UPDATE
    `);
    return rows[0] ?? null;
  }

  updateParticipantStatus(id: string, isActive: boolean) {
    return this.client.user.update({
      where: { id },
      data: { isActive },
      select: { id: true, isActive: true },
    });
  }

  revokeOpenSessions(id: string, now: Date) {
    return this.client.userSession.updateMany({
      where: {
        userId: id,
        endedAt: null,
        expiresAt: { gt: now },
      },
      data: { endedAt: now, endReason: 'REVOKED' },
    });
  }

  findParticipantById(id: string) {
    return this.client.user.findFirst({
      where: { id, role: UserRole.PARTICIPANT },
      select: participantSelect,
    });
  }

  async findParticipantCounters(id: string) {
    const [actionRedemptions, claimCodes, movements, rewards] =
      await Promise.all([
        this.client.pointEvent.count({
          where: { userId: id, source: PointEventSource.ACTION_REDEEM },
        }),
        this.client.claimCode.count({ where: { usedById: id, isUsed: true } }),
        this.client.pointEvent.count({ where: { userId: id } }),
        this.client.rewardRedemption.groupBy({
          by: ['status'],
          where: { userId: id },
          _count: { _all: true },
        }),
      ]);
    return { actionRedemptions, claimCodes, movements, rewards };
  }

  participantExists(id: string) {
    return this.client.user.findFirst({
      where: { id, role: UserRole.PARTICIPANT },
      select: { id: true },
    });
  }

  async findParticipantPointEventPage(
    id: string,
    filter: ParticipantEventPageFilter,
  ) {
    const where = {
      userId: id,
      ...(filter.source && { source: filter.source }),
      ...(filter.kind && { kind: filter.kind }),
    };
    const [total, rows] = await Promise.all([
      this.client.pointEvent.count({ where }),
      this.client.pointEvent.findMany({
        where,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          points: true,
          xpDelta: true,
          kind: true,
          source: true,
          redemptionMethod: true,
          description: true,
          createdAt: true,
          action: { select: { id: true, name: true } },
          claimCode: { select: { id: true, code: true } },
          auditEventId: true,
          auditEvent: { select: { operation: true } },
          reversedEventId: true,
          reversal: { select: { id: true } },
        },
      }),
    ]);
    return { rows, total };
  }

  async findPointEventPage(filter: PointEventFilter) {
    const where = buildPointEventWhere(filter);
    const [total, rows] = await Promise.all([
      this.client.pointEvent.count({ where }),
      this.client.pointEvent.findMany({
        where,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: pointEventSelect,
      }),
    ]);
    return { rows, total };
  }

  async findParticipantRedemptionPage(
    id: string,
    filter: ParticipantRedemptionPageFilter,
  ) {
    const where = {
      userId: id,
      ...(filter.status && { status: filter.status }),
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
          pointsSpent: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          reward: { select: { id: true, name: true } },
        },
      }),
    ]);
    return { rows, total };
  }

  private transactional(tx: Prisma.TransactionClient) {
    const repository = Object.create(
      AdminParticipantsRepository.prototype,
    ) as AdminParticipantsRepository;
    repository.client = tx;
    Object.assign(repository, {
      prisma: this.prisma,
      auditRepository: this.auditRepository,
      auditWriter: this.auditRepository?.bindTransaction(tx),
    });
    return repository;
  }
}
