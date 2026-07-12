import type { RedemptionStatus } from "@/features/rewards/rewards.types";

export type AdminDashboard = {
  participants: { total: number; active: number; inactive: number };
  activity: { redemptions: number; pointsIssued: number };
  codes: {
    uniqueTotal: number;
    uniqueAvailable: number;
    uniqueUsed: number;
    reusableTotal: number;
    reusableActive: number;
  };
  shop: {
    rewardsTotal: number;
    rewardsActive: number;
    outOfStock: number;
    pendingRedemptions: number;
  };
  recentPendingRedemptions: Array<{
    id: string;
    pointsSpent: number;
    status: RedemptionStatus;
    createdAt: string;
    user: { id: string; name: string };
    reward: { id: string; name: string };
  }>;
};
