import type { RedemptionStatus } from "@/features/rewards/rewards.types";

export type AdminParticipant = {
  id: string;
  name: string;
  cpf: string;
  email: string;
  points: number;
  xp: number;
  level: number;
  isActive: boolean;
  lastLoginAt: string | null;
  actionRedemptionsCount: number;
  pendingRewardRedemptionsCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminParticipantDetail = AdminParticipant & {
  counts: {
    actionRedemptions: number;
    claimCodes: number;
    movements: number;
    rewards: { pending: number; delivered: number; cancelled: number };
  };
};

export type AdminParticipantPointEvent = {
  id: string;
  points: number;
  xpDelta: number;
  kind: "CREDIT" | "DEBIT";
  source:
    | "ACTION_REDEEM"
    | "ADMIN_GRANT"
    | "ADMIN_ADJUST"
    | "REWARD_REDEMPTION";
  redemptionMethod:
    | "DIRECT"
    | "REUSABLE_CODE"
    | "CLAIM_CODE"
    | "LEGACY_UNKNOWN"
    | null;
  description: string | null;
  origin:
    | "UNIQUE_CODE"
    | "REUSABLE_CODE"
    | "DIRECT_ACTION"
    | "LEGACY_UNKNOWN"
    | "REWARD"
    | "ADMIN";
  isAudited: boolean;
  action: { id: string; name: string } | null;
  claimCode: { id: string; code: string } | null;
  reversalOfPointEventId: string | null;
  reversalPointEventId: string | null;
  createdAt: string;
};

export type AdminParticipantRewardRedemption = {
  id: string;
  pointsSpent: number;
  status: RedemptionStatus;
  reward: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
};

export type AdminParticipantsFilters = {
  page: number;
  limit: number;
  search?: string;
  status?: "active" | "inactive";
};

export type AdminPointEventsFilters = {
  page: number;
  limit: number;
  source?:
    | "all"
    | "action_redeem"
    | "admin_grant"
    | "admin_adjust"
    | "reward_redemption";
  kind?: "all" | "credit" | "debit";
};

export type AdminRewardRedemptionsFilters = {
  page: number;
  limit: number;
  status?: "all" | "pending" | "delivered" | "cancelled";
};
