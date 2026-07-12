import { RedemptionStatus } from '@prisma/client';

export class AdminDashboardPendingRedemptionResponseDto {
  id!: string;
  pointsSpent!: number;
  status!: RedemptionStatus;
  createdAt!: string;
  user!: { id: string; name: string };
  reward!: { id: string; name: string };
}

export class AdminDashboardResponseDto {
  participants!: { total: number; active: number };
  pointsAwarded!: number;
  claimCodes!: { used: number; available: number };
  shop!: {
    rewardsTotal: number;
    rewardsActive: number;
    outOfStock: number;
    pendingRedemptions: number;
  };
  recentPendingRedemptions!: AdminDashboardPendingRedemptionResponseDto[];
}
