export const AUDIT_ACTOR_TYPES = ["ADMIN", "SYSTEM"] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export const AUDIT_ENTITY_TYPES = [
  "PARTICIPANT",
  "ACTION",
  "CLAIM_CODE_BATCH",
  "CLAIM_CODE",
  "REWARD",
  "REWARD_REDEMPTION",
  "POINT_EVENT",
  "RECONCILIATION",
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const AUDIT_OPERATIONS = [
  "PARTICIPANT_STATUS_CHANGED",
  "ACTION_CREATED",
  "ACTION_UPDATED",
  "ACTION_STATUS_CHANGED",
  "CLAIM_CODE_BATCH_GENERATED",
  "CLAIM_CODE_STATUS_CHANGED",
  "REWARD_CREATED",
  "REWARD_UPDATED",
  "REWARD_STATUS_CHANGED",
  "REWARD_REDEMPTION_DELIVERED",
  "REWARD_REDEMPTION_CANCELLED",
  "PARTICIPANT_BALANCE_ADJUSTED",
  "PARTICIPANT_BALANCE_ADJUSTMENT_REVERSED",
  "RECONCILIATION_ADJUSTMENT_CONFIRMED",
] as const;
export type AuditOperation = (typeof AUDIT_OPERATIONS)[number];

export type AuditSnapshot = Record<string, unknown>;

export type AdminAuditEvent = {
  id: string;
  actorType: AuditActorType;
  actorAdminId: string | null;
  participantId: string | null;
  operation: AuditOperation;
  entityType: AuditEntityType;
  entityId: string;
  reason: string;
  before: AuditSnapshot | null;
  after: AuditSnapshot | null;
  metadata: AuditSnapshot | null;
  requestId: string;
  createdAt: string;
};

export type AuditFilters = {
  page: number;
  limit: number;
  actorType?: AuditActorType;
  actorAdminId?: string;
  operation?: AuditOperation;
  entityType?: AuditEntityType;
  entityId?: string;
  participantId?: string;
  requestId?: string;
  from?: string;
  to?: string;
};

export type AuditFilterPatch = Partial<
  Record<Exclude<keyof AuditFilters, "limit">, string | number | undefined>
>;
