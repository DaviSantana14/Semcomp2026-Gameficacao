import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  buildParticipantWhere,
  type ParticipantFilter,
} from '../admin/admin-participants.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildRedemptionWhere,
  type RedemptionFilter,
} from '../rewards/rewards.repository';
import { EXPORT_BATCH_SIZE } from './export-limits';

const participantExportSelect = {
  id: true,
  name: true,
  cpf: true,
  email: true,
  points: true,
  xp: true,
  level: true,
  isActive: true,
  createdAt: true,
} as const;

const redemptionExportSelect = {
  id: true,
  pointsSpent: true,
  status: true,
  createdAt: true,
  deliveredAt: true,
  cancelledAt: true,
  user: { select: { name: true, email: true } },
  reward: { select: { name: true } },
  deliveredByAdmin: { select: { name: true } },
  cancelledByAdmin: { select: { name: true } },
} as const;

export type ParticipantExportRow = Prisma.UserGetPayload<{
  select: typeof participantExportSelect;
}>;

export type RedemptionExportRow = Prisma.RewardRedemptionGetPayload<{
  select: typeof redemptionExportSelect;
}>;

@Injectable()
export class AdminExportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  countParticipants(filter: ParticipantFilter) {
    return this.prisma.user.count({ where: buildParticipantWhere(filter) });
  }

  findParticipantExportBlock(
    filter: ParticipantFilter,
    afterId: string | undefined,
  ): Promise<ParticipantExportRow[]> {
    const where = buildParticipantWhere(filter);
    const cursorWhere: Prisma.UserWhereInput = afterId
      ? { ...where, id: { gt: afterId } }
      : where;
    return this.prisma.user.findMany({
      where: cursorWhere,
      take: EXPORT_BATCH_SIZE,
      orderBy: { id: 'asc' },
      select: participantExportSelect,
    });
  }

  countRedemptions(filter: RedemptionFilter) {
    return this.prisma.rewardRedemption.count({
      where: buildRedemptionWhere(filter),
    });
  }

  findRedemptionExportBlock(
    filter: RedemptionFilter,
    afterId: string | undefined,
  ): Promise<RedemptionExportRow[]> {
    const where = buildRedemptionWhere(filter);
    const cursorWhere: Prisma.RewardRedemptionWhereInput = afterId
      ? { ...where, id: { gt: afterId } }
      : where;
    return this.prisma.rewardRedemption.findMany({
      where: cursorWhere,
      take: EXPORT_BATCH_SIZE,
      orderBy: { id: 'asc' },
      select: redemptionExportSelect,
    });
  }
}
