import { Injectable } from '@nestjs/common';
import { PointEventSource, RedemptionStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const [
      total,
      active,
      points,
      used,
      available,
      rewardsTotal,
      rewardsActive,
      outOfStock,
      pendingRedemptions,
      recentPendingRedemptions,
    ] = await Promise.all([
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
      this.prisma.reward.count(),
      this.prisma.reward.count({ where: { isActive: true } }),
      this.prisma.reward.count({ where: { stock: 0 } }),
      this.prisma.rewardRedemption.count({
        where: { status: RedemptionStatus.PENDING },
      }),
      this.prisma.rewardRedemption.findMany({
        where: { status: RedemptionStatus.PENDING },
        take: 5,
        orderBy: { createdAt: 'asc' },
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
      shop: {
        rewardsTotal,
        rewardsActive,
        outOfStock,
        pendingRedemptions,
      },
      recentPendingRedemptions: recentPendingRedemptions.map((redemption) => ({
        ...redemption,
        createdAt: redemption.createdAt.toISOString(),
      })),
    };
  }
}
