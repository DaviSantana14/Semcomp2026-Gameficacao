export type RedemptionStatus = "PENDING" | "DELIVERED" | "CANCELLED";

export type Reward = {
  id: string;
  name: string;
  description: string | null;
  costInPoints: number;
  stock: number;
  isActive: boolean;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RewardRedemption = {
  id: string;
  userId: string;
  rewardId: string;
  pointsSpent: number;
  status: RedemptionStatus;
  user: { id: string; name: string; email: string };
  reward: Reward;
  createdAt: string;
  updatedAt: string;
};

export type CreateRewardPayload = {
  name: string;
  description?: string;
  costInPoints: number;
  stock: number;
  isActive: boolean;
  imageUrl?: string;
  reason: string;
};

export type UpdateRewardPayload = Partial<
  Omit<CreateRewardPayload, "description" | "imageUrl" | "reason">
> & {
  description?: string | null;
  imageUrl?: string | null;
  reason: string;
};

export type UpdateRewardDetailsPayload = Omit<UpdateRewardPayload, "isActive">;

export type RedemptionTransitionPayload = { reason: string };

export type AdminReward = Reward & {
  redemptionCounts: Record<RedemptionStatus, number>;
};

export type AdminRedemption = RewardRedemption;

export type AdminRewardsFilters = {
  page: number;
  limit: number;
  search?: string;
  status?: "all" | "active" | "inactive" | "out_of_stock";
};

export type AdminRedemptionsFilters = {
  page: number;
  limit: number;
  search?: string;
  rewardId?: string;
  status?: "all" | "pending" | "delivered" | "cancelled";
};
