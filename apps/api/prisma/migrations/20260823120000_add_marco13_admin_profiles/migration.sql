BEGIN;

CREATE TYPE "AdminProfile" AS ENUM ('GENERAL', 'SHOP', 'ACTIVITIES');

ALTER TABLE "User"
  ADD COLUMN "adminProfile" "AdminProfile",
  ADD COLUMN "passwordResetRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "passwordResetExpiresAt" TIMESTAMP(3);

UPDATE "User"
SET "adminProfile" = 'GENERAL'::"AdminProfile"
WHERE "role" = 'ADMIN'::"UserRole";

ALTER TABLE "User"
  ADD CONSTRAINT "User_admin_profile_check" CHECK (
    ("role" = 'PARTICIPANT'::"UserRole" AND "adminProfile" IS NULL)
    OR
    ("role" = 'ADMIN'::"UserRole" AND "adminProfile" IS NOT NULL)
  ),
  ADD CONSTRAINT "User_participant_reset_state_check" CHECK (
    ("role" = 'ADMIN'::"UserRole" AND "passwordResetRequired" = FALSE AND "passwordResetExpiresAt" IS NULL)
    OR
    ("role" = 'PARTICIPANT'::"UserRole" AND (
      ("passwordResetRequired" = TRUE AND "passwordResetExpiresAt" IS NOT NULL)
      OR ("passwordResetRequired" = FALSE AND "passwordResetExpiresAt" IS NULL)
    ))
  );

DROP INDEX "User_role_createdAt_idx";

CREATE INDEX "User_role_adminProfile_isActive_createdAt_idx"
  ON "User"("role", "adminProfile", "isActive", "createdAt");

CREATE TABLE "AdminActivation" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdByAdminId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdminActivation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminActivation_codeHash_key"
  ON "AdminActivation"("codeHash");
CREATE INDEX "AdminActivation_adminUserId_createdAt_idx"
  ON "AdminActivation"("adminUserId", "createdAt");
CREATE INDEX "AdminActivation_expiresAt_idx"
  ON "AdminActivation"("expiresAt");

ALTER TABLE "AdminActivation"
  ADD CONSTRAINT "AdminActivation_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AdminActivation_createdByAdminId_fkey"
  FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TYPE "AuditEntityType"
  ADD VALUE 'ADMIN_OPERATOR';
ALTER TYPE "AuditOperation"
  ADD VALUE 'ADMIN_OPERATOR_CREATED';
ALTER TYPE "AuditOperation"
  ADD VALUE 'ADMIN_OPERATOR_UPDATED';
ALTER TYPE "AuditOperation"
  ADD VALUE 'ADMIN_OPERATOR_STATUS_CHANGED';
ALTER TYPE "AuditOperation"
  ADD VALUE 'ADMIN_OPERATOR_ACTIVATION_RESET';
ALTER TYPE "AuditOperation"
  ADD VALUE 'ADMIN_OPERATOR_ACTIVATED';
ALTER TYPE "AuditOperation"
  ADD VALUE 'PARTICIPANT_PASSWORD_RESET';

COMMIT;
