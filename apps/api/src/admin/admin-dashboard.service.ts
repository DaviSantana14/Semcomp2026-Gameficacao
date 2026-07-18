import { Injectable } from '@nestjs/common';
import { AdminDashboardRepository } from './admin-dashboard.repository';
import { AdminReconciliationService } from './admin-reconciliation.service';

@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly repository: AdminDashboardRepository,
    private readonly reconciliation: AdminReconciliationService,
  ) {}

  async getOverview() {
    const [data, reconciliation] = await Promise.all([
      this.repository.findOverviewData(),
      this.reconciliation.getSummary(),
    ]);
    return {
      participants: {
        total: data.total,
        active: data.active,
        inactive: data.inactive,
      },
      reconciliation,
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
