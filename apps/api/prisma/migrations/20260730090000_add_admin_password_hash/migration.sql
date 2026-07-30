-- AlterTable
ALTER TABLE "User"
ADD COLUMN "passwordHash" TEXT,
ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
