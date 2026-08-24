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

export type ActionRedemptionMethod =
  | "DIRECT"
  | "REUSABLE_CODE"
  | "CLAIM_CODE"
  | "LEGACY_UNKNOWN";

export type AdminCodeRedemption = {
  id: string;
  participant: { id: string; name: string; email: string };
  action: { id: string; name: string } | null;
  method: "REUSABLE_CODE" | "CLAIM_CODE";
  code: string | null;
  points: number;
  xpDelta: number;
  createdAt: string;
};

export type AdminCodeRedemptionsFilters = {
  page: number;
  limit: number;
  search?: string;
  actionId?: string;
  method?: "all" | "reusable_code" | "claim_code";
  from?: string;
  to?: string;
};

export type CodeRedemptionsExportFilters = Omit<
  AdminCodeRedemptionsFilters,
  "page" | "limit"
>;

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

export type ClaimCodeBatchCounts = {
  available: number;
  disabled: number;
  used: number;
  blocked: number;
};

export type ClaimCodeBatchSummary = {
  id: string;
  action: { id: string; name: string };
  createdBy: { id: string; name: string; email: string };
  requestedQuantity: number;
  createdQuantity: number;
  reason: string;
  requestId: string;
  createdAt: string;
  counts: ClaimCodeBatchCounts;
};

export type ClaimCodeBatchesFilters = {
  page: number;
  limit: number;
  actionId?: string;
  actorAdminId?: string;
  from?: string;
  to?: string;
};

export type AdminClaimCodeBatchesFilters = ClaimCodeBatchesFilters;

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

export type ClaimCodeBulkOutcome =
  | "CHANGED"
  | "ALREADY_IN_STATE"
  | "ALREADY_USED"
  | "NOT_FOUND";

export type ClaimCodeBulkCounts = {
  selected: number;
  changed: number;
  unchanged: number;
  used: number;
  notFound: number;
};

export type ClaimCodeBulkOperationItem = {
  requestedClaimCodeId: string;
  claimCodeId: string | null;
  maskedCode: string | null;
  outcome: ClaimCodeBulkOutcome;
};

export type ClaimCodeBulkOperationSummary = {
  id: string;
  actor: { id: string; name: string; email: string };
  targetIsActive: boolean;
  reason: string;
  requestId: string;
  counts: ClaimCodeBulkCounts;
  createdAt: string;
};

export type ClaimCodeBulkOperationDetail = ClaimCodeBulkOperationSummary & {
  items: ClaimCodeBulkOperationItem[];
};

export type BulkUpdateClaimCodesPayload = {
  ids: string[];
  isActive: boolean;
  reason: string;
  confirmation: "ATIVAR" | "DESATIVAR";
};

export type GeneratedClaimCodesResponse = {
  batch: ClaimCodeBatchSummary;
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
