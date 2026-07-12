import { Injectable, NotFoundException } from '@nestjs/common';
import { PointEventSource, Prisma, UserRole } from '@prisma/client';
import { paginate } from '../common/dto/pagination-response.dto';
import { PrismaService } from '../prisma/prisma.service';
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
      rewardRedemptions: { where: { status: 'PENDING' } },
    },
  },
} as const;

const participantDetailSelect = participantSelect;

@Injectable()
export class AdminParticipantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: AdminParticipantsQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = { role: UserRole.PARTICIPANT };
    if (query.status)
      where.isActive = query.status === ParticipantStatusFilter.ACTIVE;
    if (search)
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { cpf: { contains: search } },
      ];
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: participantSelect,
      }),
    ]);
    return paginate(rows.map(mapParticipant), total, query.page, query.limit);
  }

  async updateStatus(id: string, dto: UpdateParticipantStatusDto) {
    const result = await this.prisma.user.updateMany({
      where: { id, role: UserRole.PARTICIPANT },
      data: { isActive: dto.isActive },
    });
    if (result.count === 0)
      throw new NotFoundException('Participante não encontrado.');
    return this.findOne(id);
  }

  async findOne(id: string) {
    const participant = await this.prisma.user.findFirst({
      where: { id, role: UserRole.PARTICIPANT },
      select: participantDetailSelect,
    });
    if (!participant)
      throw new NotFoundException('Participante não encontrado.');
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
    return {
      ...mapParticipant(participant),
      lastLoginAt: participant.lastLoginAt?.toISOString() ?? null,
      counts: {
        actionRedemptions,
        claimCodes,
        movements,
        rewards: Object.fromEntries(
          ['PENDING', 'DELIVERED', 'CANCELLED'].map((status) => [
            status.toLowerCase(),
            rewards.find((row) => row.status === status)?._count._all ?? 0,
          ]),
        ),
      },
    };
  }

  async findPointEvents(id: string, query: AdminParticipantEventsQueryDto) {
    await this.assertParticipant(id);
    const where = {
      userId: id,
      ...(query.source &&
        query.source !== 'all' && {
          source: query.source.toUpperCase() as PointEventSource,
        }),
      ...(query.kind &&
        query.kind !== 'all' && {
          kind: query.kind.toUpperCase() as import('@prisma/client').PointEventKind,
        }),
    };
    const [total, rows] = await Promise.all([
      this.prisma.pointEvent.count({ where }),
      this.prisma.pointEvent.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          points: true,
          kind: true,
          source: true,
          redemptionMethod: true,
          description: true,
          createdAt: true,
          action: { select: { id: true, name: true } },
          claimCode: { select: { id: true, code: true } },
        },
      }),
    ]);
    return paginate(
      rows.map((row) => ({
        ...row,
        xpDelta:
          row.source === 'ACTION_REDEEM' && row.kind === 'CREDIT'
            ? row.points
            : 0,
        origin:
          row.source === 'REWARD_REDEMPTION'
            ? 'REWARD'
            : row.source !== 'ACTION_REDEEM'
              ? 'ADMIN'
              : row.redemptionMethod === 'CLAIM_CODE'
                ? 'UNIQUE_CODE'
                : row.redemptionMethod === 'REUSABLE_CODE'
                  ? 'REUSABLE_CODE'
                  : 'DIRECT_ACTION',
        createdAt: row.createdAt.toISOString(),
      })),
      total,
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
    const where = { userId: id, ...(status && { status }) };
    const [total, rows] = await Promise.all([
      this.prisma.rewardRedemption.count({ where }),
      this.prisma.rewardRedemption.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
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
    return paginate(
      rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      total,
      query.page,
      query.limit,
    );
  }

  private async assertParticipant(id: string) {
    const participant = await this.prisma.user.findFirst({
      where: { id, role: UserRole.PARTICIPANT },
      select: { id: true },
    });
    if (!participant)
      throw new NotFoundException('Participante não encontrado.');
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
