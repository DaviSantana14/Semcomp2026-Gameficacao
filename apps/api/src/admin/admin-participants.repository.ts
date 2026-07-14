import { Injectable } from '@nestjs/common';
import {
  PointEventSource,
  Prisma,
  RedemptionStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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

export interface ParticipantPageFilter {
  page: number;
  limit: number;
  search?: string;
  isActive?: boolean;
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

@Injectable()
export class AdminParticipantsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findParticipantPage(filter: ParticipantPageFilter) {
    const where: Prisma.UserWhereInput = { role: UserRole.PARTICIPANT };
    if (filter.isActive !== undefined) where.isActive = filter.isActive;
    if (filter.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { email: { contains: filter.search, mode: 'insensitive' } },
        { cpf: { contains: filter.search } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        orderBy: { createdAt: 'desc' },
        select: participantSelect,
      }),
    ]);
    return { rows, total };
  }

  updateParticipantStatus(id: string, isActive: boolean) {
    return this.prisma.user.updateMany({
      where: { id, role: UserRole.PARTICIPANT },
      data: { isActive },
    });
  }

  findParticipantById(id: string) {
    return this.prisma.user.findFirst({
      where: { id, role: UserRole.PARTICIPANT },
      select: participantSelect,
    });
  }

  async findParticipantCounters(id: string) {
    const [actionRedemptions, claimCodes, movements, rewards] =
      await Promise.all([
        this.prisma.pointEvent.count({
          where: { userId: id, source: PointEventSource.ACTION_REDEEM },
        }),
        this.prisma.claimCode.count({ where: { usedById: id, isUsed: true } }),
        this.prisma.pointEvent.count({ where: { userId: id } }),
        this.prisma.rewardRedemption.groupBy({
          by: ['status'],
          where: { userId: id },
          _count: { _all: true },
        }),
      ]);
    return { actionRedemptions, claimCodes, movements, rewards };
  }

  participantExists(id: string) {
    return this.prisma.user.findFirst({
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
      this.prisma.pointEvent.count({ where }),
      this.prisma.pointEvent.findMany({
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
          reversedEventId: true,
          reversal: { select: { id: true } },
        },
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
      this.prisma.rewardRedemption.count({ where }),
      this.prisma.rewardRedemption.findMany({
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
}
