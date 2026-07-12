DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "Action"
        WHERE UPPER("code") ~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'
    ) THEN
        RAISE EXCEPTION 'Migration aborted: Action.code contains values in the namespace reserved for single-use claim codes.';
    END IF;
END $$;

ALTER TABLE "Action"
ADD CONSTRAINT "Action_code_not_claim_code_check"
CHECK ("code" IS NULL OR UPPER("code") !~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$');

CREATE TABLE "ClaimCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "usedById" TEXT,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimCode_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ClaimCode_code_format_check" CHECK ("code" ~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'),
    CONSTRAINT "ClaimCode_usage_consistency_check" CHECK (
        ("isUsed" = false AND "usedById" IS NULL AND "usedAt" IS NULL)
        OR
        ("isUsed" = true AND "usedById" IS NOT NULL AND "usedAt" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "ClaimCode_code_key" ON "ClaimCode"("code");
CREATE INDEX "ClaimCode_actionId_idx" ON "ClaimCode"("actionId");
CREATE INDEX "ClaimCode_usedById_idx" ON "ClaimCode"("usedById");
CREATE INDEX "ClaimCode_actionId_isUsed_idx" ON "ClaimCode"("actionId", "isUsed");

ALTER TABLE "ClaimCode" ADD CONSTRAINT "ClaimCode_actionId_fkey"
FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClaimCode" ADD CONSTRAINT "ClaimCode_usedById_fkey"
FOREIGN KEY ("usedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
