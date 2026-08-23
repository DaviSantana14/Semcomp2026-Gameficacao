BEGIN;

CREATE TYPE "ClaimCodeBulkOutcome" AS ENUM (
  'CHANGED',
  'ALREADY_IN_STATE',
  'ALREADY_USED',
  'NOT_FOUND'
);

ALTER TYPE "AuditEntityType"
  ADD VALUE 'CLAIM_CODE_BULK_OPERATION';
ALTER TYPE "AuditOperation"
  ADD VALUE 'CLAIM_CODE_BULK_STATUS_CHANGED';

CREATE TABLE "ClaimCodeBatch" (
  "id" TEXT NOT NULL,
  "actionId" TEXT NOT NULL,
  "createdByAdminId" TEXT NOT NULL,
  "requestedQuantity" INTEGER NOT NULL,
  "createdQuantity" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ClaimCodeBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClaimCodeBatch_quantities_check" CHECK (
    "requestedQuantity" BETWEEN 1 AND 500
    AND "createdQuantity" BETWEEN 0 AND "requestedQuantity"
  )
);

ALTER TABLE "ClaimCode"
  ADD COLUMN "batchId" TEXT;

CREATE TABLE "ClaimCodeBulkOperation" (
  "id" TEXT NOT NULL,
  "actorAdminId" TEXT NOT NULL,
  "targetIsActive" BOOLEAN NOT NULL,
  "reason" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "selectedCount" INTEGER NOT NULL,
  "changedCount" INTEGER NOT NULL,
  "unchangedCount" INTEGER NOT NULL,
  "usedCount" INTEGER NOT NULL,
  "notFoundCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ClaimCodeBulkOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClaimCodeBulkOperation_counts_check" CHECK (
    "selectedCount" BETWEEN 1 AND 500
    AND "changedCount" >= 0
    AND "unchangedCount" >= 0
    AND "usedCount" >= 0
    AND "notFoundCount" >= 0
    AND "changedCount" + "unchangedCount" + "usedCount" + "notFoundCount" = "selectedCount"
  )
);

CREATE TABLE "ClaimCodeBulkOperationItem" (
  "operationId" TEXT NOT NULL,
  "requestedClaimCodeId" TEXT NOT NULL,
  "claimCodeId" TEXT,
  "maskedCode" TEXT,
  "outcome" "ClaimCodeBulkOutcome" NOT NULL,

  CONSTRAINT "ClaimCodeBulkOperationItem_pkey" PRIMARY KEY ("operationId", "requestedClaimCodeId"),
  CONSTRAINT "ClaimCodeBulkOperationItem_maskedCode_check" CHECK (
    "maskedCode" IS NULL
    OR (
      char_length("maskedCode") <= 100
      AND "maskedCode" ~ '^(\*{1,4}|[^*]{2}\*+[^*]{2})$'
    )
  )
);

CREATE TABLE "SecurityHttpMetricMinute" (
  "minuteStart" TIMESTAMP(3) NOT NULL,
  "unauthorizedCount" INTEGER NOT NULL DEFAULT 0,
  "forbiddenCount" INTEGER NOT NULL DEFAULT 0,
  "rateLimitedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SecurityHttpMetricMinute_pkey" PRIMARY KEY ("minuteStart")
);

CREATE UNIQUE INDEX "ClaimCodeBatch_requestId_key"
  ON "ClaimCodeBatch"("requestId");
CREATE INDEX "ClaimCodeBatch_actionId_createdAt_idx"
  ON "ClaimCodeBatch"("actionId", "createdAt");
CREATE INDEX "ClaimCodeBatch_createdByAdminId_createdAt_idx"
  ON "ClaimCodeBatch"("createdByAdminId", "createdAt");
CREATE INDEX "ClaimCode_batchId_createdAt_idx"
  ON "ClaimCode"("batchId", "createdAt");
CREATE UNIQUE INDEX "ClaimCodeBulkOperation_requestId_key"
  ON "ClaimCodeBulkOperation"("requestId");
CREATE INDEX "ClaimCodeBulkOperation_actorAdminId_createdAt_idx"
  ON "ClaimCodeBulkOperation"("actorAdminId", "createdAt");
CREATE INDEX "ClaimCodeBulkOperation_createdAt_idx"
  ON "ClaimCodeBulkOperation"("createdAt");
CREATE INDEX "ClaimCodeBulkOperationItem_claimCodeId_idx"
  ON "ClaimCodeBulkOperationItem"("claimCodeId");
CREATE INDEX "SecurityHttpMetricMinute_minuteStart_idx"
  ON "SecurityHttpMetricMinute"("minuteStart");

ALTER TABLE "ClaimCodeBatch"
  ADD CONSTRAINT "ClaimCodeBatch_actionId_fkey"
  FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ClaimCodeBatch_createdByAdminId_fkey"
  FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClaimCode"
  ADD CONSTRAINT "ClaimCode_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "ClaimCodeBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClaimCodeBulkOperation"
  ADD CONSTRAINT "ClaimCodeBulkOperation_actorAdminId_fkey"
  FOREIGN KEY ("actorAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClaimCodeBulkOperationItem"
  ADD CONSTRAINT "ClaimCodeBulkOperationItem_operationId_fkey"
  FOREIGN KEY ("operationId") REFERENCES "ClaimCodeBulkOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ClaimCodeBulkOperationItem_claimCodeId_fkey"
  FOREIGN KEY ("claimCodeId") REFERENCES "ClaimCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "ClaimCodeBulkOperation_append_only"
BEFORE UPDATE OR DELETE ON "ClaimCodeBulkOperation"
FOR EACH ROW EXECUTE FUNCTION reject_immutable_ledger_change();

CREATE TRIGGER "ClaimCodeBulkOperationItem_append_only"
BEFORE UPDATE OR DELETE ON "ClaimCodeBulkOperationItem"
FOR EACH ROW EXECUTE FUNCTION reject_immutable_ledger_change();

COMMIT;
