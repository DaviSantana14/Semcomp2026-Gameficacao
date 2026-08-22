import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const ONLINE_WINDOW_SECONDS = 120;

export type PresenceCollectionWindow = {
  now: Date;
  dayStart: Date;
  nextDayStart: Date;
};

export type PresenceCollectionCounts = {
  onlineParticipants: number;
  registeredParticipants: number;
  uniqueParticipantLogins: number;
  newParticipantRegistrations: number;
};

export type DailySummaryObservation = PresenceCollectionCounts & {
  operationalDate: Date;
  observedAt: Date;
};

@Injectable()
export class PresenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getCollectionCounts(
    window: PresenceCollectionWindow,
  ): Promise<PresenceCollectionCounts> {
    const onlineSince = new Date(
      window.now.getTime() - ONLINE_WINDOW_SECONDS * 1000,
    );
    const [row] = await this.prisma.$queryRaw<
      Array<{
        onlineParticipants: bigint | number;
        registeredParticipants: bigint | number;
        uniqueParticipantLogins: bigint | number;
        newParticipantRegistrations: bigint | number;
      }>
    >(Prisma.sql`
      SELECT
        (
          SELECT COUNT(DISTINCT s."userId")
          FROM "UserSession" s
          INNER JOIN "User" u ON u."id" = s."userId"
          WHERE u."role" = 'PARTICIPANT'::"UserRole"
            AND u."isActive" IS TRUE
            AND s."endedAt" IS NULL
            AND s."expiresAt" > ${window.now}
            AND s."lastSeenAt" >= ${onlineSince}
        ) AS "onlineParticipants",
        (
          SELECT COUNT(*)
          FROM "User" u
          WHERE u."role" = 'PARTICIPANT'::"UserRole"
            AND u."createdAt" <= ${window.now}
        ) AS "registeredParticipants",
        (
          SELECT COUNT(DISTINCT s."userId")
          FROM "UserSession" s
          INNER JOIN "User" u ON u."id" = s."userId"
          WHERE u."role" = 'PARTICIPANT'::"UserRole"
            AND s."startedAt" >= ${window.dayStart}
            AND s."startedAt" < ${window.nextDayStart}
            AND s."startedAt" <= ${window.now}
        ) AS "uniqueParticipantLogins",
        (
          SELECT COUNT(*)
          FROM "User" u
          WHERE u."role" = 'PARTICIPANT'::"UserRole"
            AND u."createdAt" >= ${window.dayStart}
            AND u."createdAt" < ${window.nextDayStart}
            AND u."createdAt" <= ${window.now}
        ) AS "newParticipantRegistrations"
    `);

    return {
      onlineParticipants: toCount(row?.onlineParticipants),
      registeredParticipants: toCount(row?.registeredParticipants),
      uniqueParticipantLogins: toCount(row?.uniqueParticipantLogins),
      newParticipantRegistrations: toCount(row?.newParticipantRegistrations),
    };
  }

  upsertDailySummary(observation: DailySummaryObservation) {
    return this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "PresenceDailySummary" (
        "operationalDate",
        "lastObservedOnlineParticipants",
        "registeredParticipantsAtLastObservation",
        "lastCollectedAt",
        "peakOnlineParticipants",
        "peakAt",
        "registeredParticipantsAtPeak",
        "uniqueParticipantLogins",
        "newParticipantRegistrations",
        "updatedAt"
      ) VALUES (
        ${observation.operationalDate},
        ${observation.onlineParticipants},
        ${observation.registeredParticipants},
        ${observation.observedAt},
        ${observation.onlineParticipants},
        ${observation.observedAt},
        ${observation.registeredParticipants},
        ${observation.uniqueParticipantLogins},
        ${observation.newParticipantRegistrations},
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("operationalDate") DO UPDATE SET
        "lastObservedOnlineParticipants" = EXCLUDED."lastObservedOnlineParticipants",
        "registeredParticipantsAtLastObservation" = EXCLUDED."registeredParticipantsAtLastObservation",
        "lastCollectedAt" = GREATEST(
          "PresenceDailySummary"."lastCollectedAt",
          EXCLUDED."lastCollectedAt"
        ),
        "peakOnlineParticipants" = GREATEST(
          "PresenceDailySummary"."peakOnlineParticipants",
          EXCLUDED."peakOnlineParticipants"
        ),
        "peakAt" = CASE
          WHEN EXCLUDED."peakOnlineParticipants" > "PresenceDailySummary"."peakOnlineParticipants"
            THEN EXCLUDED."peakAt"
          ELSE "PresenceDailySummary"."peakAt"
        END,
        "registeredParticipantsAtPeak" = CASE
          WHEN EXCLUDED."peakOnlineParticipants" > "PresenceDailySummary"."peakOnlineParticipants"
            THEN EXCLUDED."registeredParticipantsAtPeak"
          ELSE "PresenceDailySummary"."registeredParticipantsAtPeak"
        END,
        "uniqueParticipantLogins" = GREATEST(
          "PresenceDailySummary"."uniqueParticipantLogins",
          EXCLUDED."uniqueParticipantLogins"
        ),
        "newParticipantRegistrations" = GREATEST(
          "PresenceDailySummary"."newParticipantRegistrations",
          EXCLUDED."newParticipantRegistrations"
        ),
        "updatedAt" = CURRENT_TIMESTAMP
    `);
  }

  findDailySummaries(from: Date, to: Date) {
    return this.prisma.presenceDailySummary.findMany({
      where: { operationalDate: { gte: from, lt: to } },
      orderBy: { operationalDate: 'asc' },
    });
  }

  findDailySummary(operationalDate: Date) {
    return this.prisma.presenceDailySummary.findUnique({
      where: { operationalDate },
    });
  }

  deleteSummariesBefore(cutoff: Date) {
    return this.prisma.presenceDailySummary.deleteMany({
      where: { operationalDate: { lt: cutoff } },
    });
  }
}

function toCount(value: bigint | number | undefined): number {
  return typeof value === 'bigint' ? Number(value) : (value ?? 0);
}
