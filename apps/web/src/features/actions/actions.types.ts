export type ActionType =
  | "CHECKIN"
  | "ATTENDANCE"
  | "STAND_VISIT"
  | "EASTER_EGG"
  | "QUESTION"
  | "DYNAMIC"
  | "BONUS";

export type Action = {
  id: string;
  name: string;
  description: string | null;
  type: ActionType;
  code: string | null;
  points: number;
  isActive: boolean;
  isCodeActive: boolean;
  createdAt: string;
};

export type AdminAction = Action & {
  claimCodes: { total: number; used: number; available: number };
  redemptionsCount: number;
};

export type AdminClaimCodeStatus =
  | "AVAILABLE"
  | "DISABLED"
  | "BLOCKED_BY_ACTION"
  | "USED";

export type AdminClaimCode = {
  id: string;
  code: string;
  status: AdminClaimCodeStatus;
  isActive: boolean;
  isUsed: boolean;
  createdAt: string;
  usedAt: string | null;
  action: { id: string; name: string };
  usedBy: { id: string; name: string; email: string } | null;
};

export type AdminReusableCode = {
  id: string;
  name: string;
  type: ActionType;
  code: string;
  points: number;
  status: "ACTIVE" | "DISABLED" | "BLOCKED_BY_ACTION";
  isCodeActive: boolean;
  totalUses: number;
  lastUsedAt: string | null;
};

export type ReusableCodeRedemption = {
  id: string;
  points: number;
  createdAt: string;
  participant: { id: string; name: string; email: string };
};

export type AdminActionsFilters = {
  page: number;
  limit: number;
  search?: string;
  status?: "active" | "inactive";
  type?: ActionType;
};

export type AdminClaimCodesFilters = {
  page: number;
  limit: number;
  actionId?: string;
  search?: string;
  status?: "all" | "available" | "disabled" | "blocked" | "used";
};

export type AdminReusableCodesFilters = {
  page: number;
  limit: number;
  search?: string;
  status?: "all" | "active" | "disabled" | "blocked";
  actionId?: string;
};

export type UpdateActionPayload = Partial<
  Pick<Action, "name" | "type" | "points" | "isActive" | "isCodeActive">
> & { description?: string | null; code?: string | null; reason: string };

export type CreateActionPayload = {
  name: string;
  description?: string;
  type: ActionType;
  code?: string;
  points: number;
  isActive?: boolean;
  reason: string;
};

export type GenerateClaimCodesPayload = { quantity: number; reason: string };

export type UpdateClaimCodeStatusPayload = {
  isActive: boolean;
  reason: string;
};

export type GeneratedClaimCodesResponse = {
  action: Pick<Action, "id" | "name">;
  quantity: number;
  codes: string[];
};

export type RedeemActionResponse = {
  message: string;
  action: Action;
  awardedPoints: number;
  awardedXp: number;
  currentPoints: number;
  currentXp: number;
  currentLevel: number;
  redeemedAt: string;
};
