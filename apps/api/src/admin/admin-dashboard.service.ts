import { Injectable } from '@nestjs/common';
import { AdminDashboardRepository } from './admin-dashboard.repository';

@Injectable()
export class AdminDashboardService {
  constructor(private readonly repository: AdminDashboardRepository) {}

  async getOverview() {
    const data = await this.repository.findOverviewData();
    return {
      participants: {
        total: data.total,
        active: data.active,
        inactive: data.inactive,
      },
      activity: {
        redemptions: data.points._count._all,
        pointsIssued: data.points._sum.points ?? 0,
      },
      codes: {
        uniqueTotal: data.uniqueTotal,
        uniqueAvailable: data.available,
        uniqueUsed: data.used,
        reusableTotal: data.reusableTotal,
        reusableActive: data.reusableActive,
      },
      shop: {
        rewardsTotal: data.rewardsTotal,
        rewardsActive: data.rewardsActive,
        outOfStock: data.outOfStock,
        pendingRedemptions: data.pendingRedemptions,
      },
      recentPendingRedemptions: data.recentPendingRedemptions.map(
        (redemption) => ({
          ...redemption,
          createdAt: redemption.createdAt.toISOString(),
        }),
      ),
    };
  }
}
