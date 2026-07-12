CREATE TYPE "ActionRedemptionMethod" AS ENUM ('DIRECT', 'REUSABLE_CODE', 'CLAIM_CODE', 'LEGACY_UNKNOWN');

ALTER TABLE "Action" ADD COLUMN "isCodeActive" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Action" SET "isCodeActive" = true WHERE "code" IS NOT NULL;
UPDATE "Action" SET "isCodeActive" = false WHERE "code" IS NULL;

ALTER TABLE "ClaimCode" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
UPDATE "ClaimCode" SET "isActive" = false WHERE "isUsed" = true;

ALTER TABLE "PointEvent"
  ADD COLUMN "redemptionMethod" "ActionRedemptionMethod",
  ADD COLUMN "claimCodeId" TEXT;

CREATE TEMP TABLE "_ClaimCodePointEventBackfill" ON COMMIT DROP AS
SELECT cc."id" AS "claimCodeId", pe."id" AS "pointEventId"
FROM "ClaimCode" cc
LEFT JOIN "PointEvent" pe
  ON pe."userId" = cc."usedById"
 AND pe."actionId" = cc."actionId"
 AND pe."source" = 'ACTION_REDEEM'
WHERE cc."isUsed" = true;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "_ClaimCodePointEventBackfill" mapping
    GROUP BY mapping."claimCodeId"
    HAVING COUNT(mapping."pointEventId") <> 1
  ) THEN
    RAISE EXCEPTION 'Cannot backfill used ClaimCode: expected exactly one matching ACTION_REDEEM PointEvent';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "_ClaimCodePointEventBackfill" mapping
    WHERE mapping."pointEventId" IS NOT NULL
    GROUP BY mapping."pointEventId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot backfill used ClaimCode: multiple ClaimCodes match the same ACTION_REDEEM PointEvent';
  END IF;
END $$;

UPDATE "PointEvent" pe
SET "claimCodeId" = mapping."claimCodeId", "redemptionMethod" = 'CLAIM_CODE'
FROM "_ClaimCodePointEventBackfill" mapping
WHERE pe."id" = mapping."pointEventId";

UPDATE "PointEvent"
SET "redemptionMethod" = 'LEGACY_UNKNOWN'
WHERE "source" = 'ACTION_REDEEM' AND "redemptionMethod" IS NULL;

CREATE UNIQUE INDEX "PointEvent_claimCodeId_key" ON "PointEvent"("claimCodeId");
DROP INDEX "ClaimCode_actionId_isUsed_idx";
CREATE INDEX "ClaimCode_actionId_isUsed_isActive_createdAt_idx" ON "ClaimCode"("actionId", "isUsed", "isActive", "createdAt");
CREATE INDEX "PointEvent_redemptionMethod_createdAt_idx" ON "PointEvent"("redemptionMethod", "createdAt");
CREATE INDEX "RewardRedemption_status_createdAt_idx" ON "RewardRedemption"("status", "createdAt");

ALTER TABLE "PointEvent" ADD CONSTRAINT "PointEvent_claimCodeId_fkey"
  FOREIGN KEY ("claimCodeId") REFERENCES "ClaimCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClaimCode" ADD CONSTRAINT "ClaimCode_used_not_active_check"
  CHECK (NOT "isUsed" OR NOT "isActive");
ALTER TABLE "PointEvent" ADD CONSTRAINT "PointEvent_action_redemption_method_check"
  CHECK (("source" = 'ACTION_REDEEM' AND "redemptionMethod" IS NOT NULL) OR ("source" <> 'ACTION_REDEEM' AND "redemptionMethod" IS NULL));
ALTER TABLE "PointEvent" ADD CONSTRAINT "PointEvent_claim_code_method_check"
  CHECK (("redemptionMethod" = 'CLAIM_CODE' AND "claimCodeId" IS NOT NULL) OR ("redemptionMethod" IS DISTINCT FROM 'CLAIM_CODE' AND "claimCodeId" IS NULL));
