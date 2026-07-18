import type { AdminAuditEvent } from "@/features/audit/audit.types";

export type ParticipantReconciliation = {
  participantId: string;
  name: string;
  email: string;
  storedPoints: number;
  ledgerPoints: number;
  pointsDifference: number;
  storedXp: number;
  ledgerXp: number;
  xpDifference: number;
  status: "CONSISTENT" | "DIVERGENT";
  lastEventAt: string | null;
};

type PointEventResult = {
  id: string;
  pointsDelta: number;
  xpDelta: number;
  kind: "CREDIT" | "DEBIT";
  source: "ADMIN_GRANT" | "ADMIN_ADJUST";
  reversalOfPointEventId?: string | null;
  origin?: "RECONCILIATION_COMPENSATION";
  createdAt: string;
};

type AuditEventResult = Pick<
  AdminAuditEvent,
  "id" | "operation" | "requestId" | "createdAt"
>;

export type BalanceOperationResult = {
  before: { points: number; xp: number };
  after: { points: number; xp: number };
  pointEvent: PointEventResult;
  auditEvent: AuditEventResult;
  replayed: boolean;
};

export type ReconciliationSnapshot = Omit<
  ParticipantReconciliation,
  "name" | "email" | "lastEventAt"
>;

export type ReconciliationConfirmationResult = {
  before: ReconciliationSnapshot;
  after: ReconciliationSnapshot;
  pointEvent: PointEventResult & { origin: "RECONCILIATION_COMPENSATION" };
  pointEvents: Array<
    PointEventResult & { origin: "RECONCILIATION_COMPENSATION" }
  >;
  auditEvent: AuditEventResult;
  replayed: boolean;
};

export type OperationPayload = { reason: string; idempotencyKey: string };
export type AdjustmentPayload = OperationPayload & {
  pointsDelta: number;
  xpDelta: number;
};
