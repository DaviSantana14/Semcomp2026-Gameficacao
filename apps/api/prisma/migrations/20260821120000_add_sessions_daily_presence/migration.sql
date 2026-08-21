-- CreateEnum
CREATE TYPE "SessionEndReason" AS ENUM ('LOGOUT', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endReason" "SessionEndReason",

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresenceDailySummary" (
    "operationalDate" DATE NOT NULL,
    "lastObservedOnlineParticipants" INTEGER NOT NULL,
    "registeredParticipantsAtLastObservation" INTEGER NOT NULL,
    "lastCollectedAt" TIMESTAMP(3) NOT NULL,
    "peakOnlineParticipants" INTEGER NOT NULL,
    "peakAt" TIMESTAMP(3),
    "registeredParticipantsAtPeak" INTEGER NOT NULL,
    "uniqueParticipantLogins" INTEGER NOT NULL,
    "newParticipantRegistrations" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PresenceDailySummary_pkey" PRIMARY KEY ("operationalDate")
);

-- CreateIndex
CREATE INDEX "UserSession_userId_lastSeenAt_idx" ON "UserSession"("userId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "UserSession_endedAt_expiresAt_idx" ON "UserSession"("endedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "UserSession_lastSeenAt_idx" ON "UserSession"("lastSeenAt");

-- CreateIndex
CREATE INDEX "UserSession_startedAt_idx" ON "UserSession"("startedAt");

-- CreateIndex
CREATE INDEX "User_role_createdAt_idx" ON "User"("role", "createdAt");

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
