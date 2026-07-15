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

export type OperationResult = {
  before: { points: number; xp: number };
  after: { points: number; xp: number };
  pointEvent: {
    id: string;
    pointsDelta: number;
    xpDelta: number;
    kind: "CREDIT" | "DEBIT";
    source: "ADMIN_GRANT" | "ADMIN_ADJUST";
    reversalOfPointEventId?: string | null;
    origin?: "RECONCILIATION_COMPENSATION";
    createdAt: string;
  };
  auditEvent: Pick<
    AdminAuditEvent,
    "id" | "operation" | "requestId" | "createdAt"
  >;
  replayed: boolean;
};

export type OperationPayload = { reason: string; idempotencyKey: string };
export type AdjustmentPayload = OperationPayload & {
  pointsDelta: number;
  xpDelta: number;
};
