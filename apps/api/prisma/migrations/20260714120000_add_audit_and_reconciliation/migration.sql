CREATE TYPE "AuditActorType" AS ENUM ('ADMIN', 'SYSTEM');
CREATE TYPE "AuditEntityType" AS ENUM (
  'PARTICIPANT',
  'ACTION',
  'CLAIM_CODE_BATCH',
  'CLAIM_CODE',
  'REWARD',
  'REWARD_REDEMPTION',
  'POINT_EVENT',
  'RECONCILIATION'
);
CREATE TYPE "AuditOperation" AS ENUM (
  'PARTICIPANT_STATUS_CHANGED',
  'ACTION_CREATED',
  'ACTION_UPDATED',
  'ACTION_STATUS_CHANGED',
  'CLAIM_CODE_BATCH_GENERATED',
  'CLAIM_CODE_STATUS_CHANGED',
  'REWARD_CREATED',
  'REWARD_UPDATED',
  'REWARD_STATUS_CHANGED',
  'REWARD_REDEMPTION_DELIVERED',
  'REWARD_REDEMPTION_CANCELLED',
  'PARTICIPANT_BALANCE_ADJUSTED',
  'PARTICIPANT_BALANCE_ADJUSTMENT_REVERSED',
  'RECONCILIATION_ADJUSTMENT_CONFIRMED'
);

CREATE TABLE "AdminAuditEvent" (
  "id" TEXT NOT NULL,
  "actorType" "AuditActorType" NOT NULL,
  "actorAdminId" TEXT,
  "participantId" TEXT,
  "operation" "AuditOperation" NOT NULL,
  "entityType" "AuditEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "metadata" JSONB,
  "requestId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminAuditEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PointEvent"
  ADD COLUMN "xpDelta" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "auditEventId" TEXT,
  ADD COLUMN "rewardRedemptionId" TEXT,
  ADD COLUMN "actorAdminId" TEXT,
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "reversedEventId" TEXT;

ALTER TABLE "RewardRedemption"
  ADD COLUMN "deliveredAt" TIMESTAMP(3),
  ADD COLUMN "deliveredByAdminId" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledByAdminId" TEXT;

UPDATE "PointEvent"
SET "xpDelta" = CASE WHEN "source" = 'ACTION_REDEEM' THEN "points" ELSE 0 END;

ALTER TABLE "PointEvent" DROP CONSTRAINT "PointEvent_userId_fkey";
ALTER TABLE "RewardRedemption" DROP CONSTRAINT "RewardRedemption_userId_fkey";

CREATE UNIQUE INDEX "PointEvent_idempotencyKey_key" ON "PointEvent"("idempotencyKey");
CREATE UNIQUE INDEX "PointEvent_reversedEventId_key" ON "PointEvent"("reversedEventId");
CREATE INDEX "PointEvent_auditEventId_idx" ON "PointEvent"("auditEventId");
CREATE INDEX "PointEvent_rewardRedemptionId_idx" ON "PointEvent"("rewardRedemptionId");
CREATE INDEX "PointEvent_actorAdminId_idx" ON "PointEvent"("actorAdminId");
CREATE INDEX "RewardRedemption_deliveredByAdminId_idx" ON "RewardRedemption"("deliveredByAdminId");
CREATE INDEX "RewardRedemption_cancelledByAdminId_idx" ON "RewardRedemption"("cancelledByAdminId");
CREATE INDEX "AdminAuditEvent_createdAt_idx" ON "AdminAuditEvent"("createdAt");
CREATE INDEX "AdminAuditEvent_actorAdminId_createdAt_idx" ON "AdminAuditEvent"("actorAdminId", "createdAt");
CREATE INDEX "AdminAuditEvent_participantId_createdAt_idx" ON "AdminAuditEvent"("participantId", "createdAt");
CREATE INDEX "AdminAuditEvent_operation_createdAt_idx" ON "AdminAuditEvent"("operation", "createdAt");
CREATE INDEX "AdminAuditEvent_entityType_entityId_createdAt_idx" ON "AdminAuditEvent"("entityType", "entityId", "createdAt");
CREATE INDEX "AdminAuditEvent_requestId_idx" ON "AdminAuditEvent"("requestId");

ALTER TABLE "AdminAuditEvent" ADD CONSTRAINT "AdminAuditEvent_actor_check"
  CHECK (
    ("actorType" = 'ADMIN' AND "actorAdminId" IS NOT NULL)
    OR ("actorType" = 'SYSTEM' AND "actorAdminId" IS NULL)
  );
ALTER TABLE "PointEvent" ADD CONSTRAINT "PointEvent_credit_points_check"
  CHECK ("kind" <> 'CREDIT' OR "points" >= 0);
ALTER TABLE "PointEvent" ADD CONSTRAINT "PointEvent_debit_points_check"
  CHECK ("kind" <> 'DEBIT' OR "points" <= 0);

ALTER TABLE "PointEvent" ADD CONSTRAINT "PointEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RewardRedemption" ADD CONSTRAINT "RewardRedemption_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminAuditEvent" ADD CONSTRAINT "AdminAuditEvent_actorAdminId_fkey"
  FOREIGN KEY ("actorAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminAuditEvent" ADD CONSTRAINT "AdminAuditEvent_participantId_fkey"
  FOREIGN KEY ("participantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PointEvent" ADD CONSTRAINT "PointEvent_auditEventId_fkey"
  FOREIGN KEY ("auditEventId") REFERENCES "AdminAuditEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PointEvent" ADD CONSTRAINT "PointEvent_rewardRedemptionId_fkey"
  FOREIGN KEY ("rewardRedemptionId") REFERENCES "RewardRedemption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PointEvent" ADD CONSTRAINT "PointEvent_actorAdminId_fkey"
  FOREIGN KEY ("actorAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PointEvent" ADD CONSTRAINT "PointEvent_reversedEventId_fkey"
  FOREIGN KEY ("reversedEventId") REFERENCES "PointEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RewardRedemption" ADD CONSTRAINT "RewardRedemption_deliveredByAdminId_fkey"
  FOREIGN KEY ("deliveredByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RewardRedemption" ADD CONSTRAINT "RewardRedemption_cancelledByAdminId_fkey"
  FOREIGN KEY ("cancelledByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION reject_immutable_ledger_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is an immutable ledger; % is not allowed', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PointEvent_append_only"
BEFORE UPDATE OR DELETE ON "PointEvent"
FOR EACH ROW EXECUTE FUNCTION reject_immutable_ledger_change();

CREATE TRIGGER "AdminAuditEvent_append_only"
BEFORE UPDATE OR DELETE ON "AdminAuditEvent"
FOR EACH ROW EXECUTE FUNCTION reject_immutable_ledger_change();
