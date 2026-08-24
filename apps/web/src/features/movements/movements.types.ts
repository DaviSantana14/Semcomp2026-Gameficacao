export const MOVEMENTS_PAGE_SIZE = 20;

export type PointEventSourceFilter =
  | "all"
  | "action_redeem"
  | "admin_grant"
  | "admin_adjust"
  | "reward_redemption";

export type PointEventKindFilter = "all" | "credit" | "debit";

export type PointEventMethodFilter =
  | "all"
  | "direct"
  | "reusable_code"
  | "claim_code"
  | "legacy_unknown";

export type PointEventOrigin =
  | "UNIQUE_CODE"
  | "REUSABLE_CODE"
  | "DIRECT_ACTION"
  | "LEGACY_UNKNOWN"
  | "REWARD"
  | "ADMIN"
  | "RECONCILIATION_COMPENSATION";

export type PointEventReferenceType =
  | "ACTION"
  | "REWARD"
  | "AUDIT"
  | "DESCRIPTION"
  | "POINT_EVENT";

export type AdminPointEvent = {
  id: string;
  participant: { id: string; name: string; email: string };
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
  reference: { type: PointEventReferenceType; label: string };
  action: { id: string; name: string } | null;
  claimCode: { id: string; code: string } | null;
  code: string | null;
  reward: { id: string; name: string } | null;
  actor: { id: string; name: string } | null;
  auditOperation: string | null;
  origin: PointEventOrigin;
  isAudited: boolean;
  description: string | null;
  reversalOfPointEventId: string | null;
  reversalPointEventId: string | null;
  createdAt: string;
};

export type AdminPointEventsFilters = {
  page: number;
  limit: number;
  search?: string;
  source?: PointEventSourceFilter;
  kind?: PointEventKindFilter;
  method?: PointEventMethodFilter;
  from?: string;
  to?: string;
};

export type MovementExportFilters = Omit<
  AdminPointEventsFilters,
  "page" | "limit"
>;

export type MovementsFilters = AdminPointEventsFilters;
export type Movement = AdminPointEvent;
