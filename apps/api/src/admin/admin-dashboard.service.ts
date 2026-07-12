import { Injectable } from '@nestjs/common';
import { PointEventSource, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const [total, active, points, used, available, recentRedemptions] =
      await Promise.all([
        this.prisma.user.count({ where: { role: UserRole.PARTICIPANT } }),
        this.prisma.user.count({
          where: { role: UserRole.PARTICIPANT, isActive: true },
        }),
        this.prisma.pointEvent.aggregate({
          where: { source: PointEventSource.ACTION_REDEEM },
          _sum: { points: true },
        }),
        this.prisma.claimCode.count({ where: { isUsed: true } }),
        this.prisma.claimCode.count({
          where: { isUsed: false, isActive: true },
        }),
        this.prisma.rewardRedemption.findMany({
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            pointsSpent: true,
            status: true,
            createdAt: true,
            user: { select: { id: true, name: true } },
            reward: { select: { id: true, name: true } },
          },
        }),
      ]);
    return {
      participants: { total, active },
      pointsAwarded: points._sum.points ?? 0,
      claimCodes: { used, available },
      recentRedemptions: recentRedemptions.map((redemption) => ({
        ...redemption,
        createdAt: redemption.createdAt.toISOString(),
      })),
    };
  }
}
