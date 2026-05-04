-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('CHECKIN', 'ATTENDANCE', 'STAND_VISIT', 'EASTER_EGG', 'QUESTION', 'DYNAMIC', 'BONUS');

-- CreateEnum
CREATE TYPE "PointEventKind" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "PointEventSource" AS ENUM ('ACTION_REDEEM', 'ADMIN_GRANT', 'ADMIN_ADJUST', 'REWARD_REDEMPTION');

-- CreateTable
CREATE TABLE "Action" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ActionType" NOT NULL,
    "points" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actionId" TEXT,
    "points" INTEGER NOT NULL,
    "kind" "PointEventKind" NOT NULL,
    "source" "PointEventSource" NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PointEvent_userId_idx" ON "PointEvent"("userId");

-- CreateIndex
CREATE INDEX "PointEvent_actionId_idx" ON "PointEvent"("actionId");

-- CreateIndex
CREATE INDEX "PointEvent_createdAt_idx" ON "PointEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "PointEvent" ADD CONSTRAINT "PointEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointEvent" ADD CONSTRAINT "PointEvent_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE SET NULL ON UPDATE CASCADE;
