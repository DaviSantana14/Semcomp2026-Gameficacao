import { Injectable, NotFoundException } from '@nestjs/common';
import { PointEventSource, Prisma, UserRole } from '@prisma/client';
import { paginate } from '../common/dto/pagination-response.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AdminParticipantEventsQueryDto } from './dto/admin-participant-events-query.dto';
import { AdminParticipantRedemptionsQueryDto } from './dto/admin-participant-redemptions-query.dto';
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
  createdAt: true,
  updatedAt: true,
  _count: { select: { pointEvents: true, rewardRedemptions: true } },
} as const;

const participantDetailSelect = {
  ...participantSelect,
  lastLoginAt: true,
} as const;

const pointEventSourceLabels: Record<PointEventSource, string> = {
  ACTION_REDEEM: 'Atividade',
  ADMIN_GRANT: 'Concessão administrativa',
  ADMIN_ADJUST: 'Ajuste administrativo',
  REWARD_REDEMPTION: 'Lojinha',
};

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
    return {
      ...mapParticipant(participant),
      lastLoginAt: participant.lastLoginAt?.toISOString() ?? null,
    };
  }

  async findPointEvents(id: string, query: AdminParticipantEventsQueryDto) {
    await this.assertParticipant(id);
    const where = {
      userId: id,
      ...(query.source && { source: query.source }),
      ...(query.kind && { kind: query.kind }),
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
        xpDelta: row.source === 'ACTION_REDEEM' ? row.points : 0,
        origin:
          firstNonBlank(row.action?.name, row.description) ??
          pointEventSourceLabels[row.source],
        action: undefined,
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
    const where = { userId: id, ...(query.status && { status: query.status }) };
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

function firstNonBlank(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
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
    pointEventsCount: _count.pointEvents,
    rewardRedemptionsCount: _count.rewardRedemptions,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
