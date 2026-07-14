import { Injectable } from '@nestjs/common';
import { PointEventKind, PointEventSource, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const rankingUserSelect = {
  id: true,
  name: true,
  xp: true,
  createdAt: true,
} as const;

const eligibilityWhere = {
  role: UserRole.PARTICIPANT,
  isActive: true,
} as const;

const rankingOrder = [
  { xp: 'desc' as const },
  { createdAt: 'asc' as const },
  { id: 'asc' as const },
];

@Injectable()
export class RankingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findTopGeneralRanking(limit: number) {
    return this.prisma.user.findMany({
      where: { ...eligibilityWhere, xp: { gt: 0 } },
      select: rankingUserSelect,
      orderBy: rankingOrder,
      take: limit,
    });
  }

  findEligibleUser(userId: string) {
    return this.prisma.user.findFirst({
      where: { id: userId, ...eligibilityWhere },
      select: rankingUserSelect,
    });
  }

  countUsersAhead(user: { id: string; xp: number; createdAt: Date }) {
    return this.prisma.user.count({
      where: {
        ...eligibilityWhere,
        OR: [
          { xp: { gt: user.xp } },
          { xp: user.xp, createdAt: { lt: user.createdAt } },
          {
            xp: user.xp,
            createdAt: user.createdAt,
            id: { lt: user.id },
          },
        ],
      },
    });
  }

  findEligibleUsers() {
    return this.prisma.user.findMany({
      where: eligibilityWhere,
      select: rankingUserSelect,
    });
  }

  findActionCreditTotals(start: Date, end: Date) {
    return this.prisma.pointEvent.groupBy({
      by: ['userId'],
      where: {
        kind: PointEventKind.CREDIT,
        source: PointEventSource.ACTION_REDEEM,
        createdAt: { gte: start, lt: end },
      },
      _sum: { points: true },
    });
  }
}
