import { Injectable } from '@nestjs/common';
import {
  addUtcDays,
  addUtcMonths,
  formatOperationalDateTime,
  OPERATIONAL_TIME_ZONE,
  operationalDateUtc,
  startOfOperationalDayUtc,
} from '../common/operational-time';
import {
  ONLINE_WINDOW_SECONDS,
  PresenceCollectionCounts,
  PresenceRepository,
  PresenceSummaryRecord,
} from './presence.repository';
import {
  PresenceDailyExportRow,
  PresenceGeneralExportRow,
} from './presence-csv';
import { SessionsService } from './sessions.service';

export const PRESENCE_HEARTBEAT_INTERVAL_SECONDS = 60;
export const PRESENCE_ONLINE_WINDOW_SECONDS = ONLINE_WINDOW_SECONDS;
export const PRESENCE_SUMMARY_RETENTION_MONTHS = 24;

@Injectable()
export class PresenceService {
  constructor(
    private readonly repository: PresenceRepository,
    private readonly sessions: SessionsService,
  ) {}

  async collect(now = new Date()) {
    await this.sessions.expire(now);

    const dayStart = startOfOperationalDayUtc(now);
    const nextDayStart = startOfOperationalDayUtc(addUtcDays(now, 1));
    const counts = await this.repository.getCollectionCounts({
      now,
      dayStart,
      nextDayStart,
    });

    await this.repository.upsertDailySummary({
      operationalDate: operationalDateUtc(now),
      observedAt: now,
      ...counts,
    });

    return counts;
  }

  async deleteRetained(now = new Date()) {
    const sessions = await this.sessions.deleteRetained(now);
    const summaries = await this.repository.deleteSummariesBefore(
      addUtcMonths(operationalDateUtc(now), -PRESENCE_SUMMARY_RETENTION_MONTHS),
    );
    return { sessions, summaries };
  }

  async getOverview(now = new Date()) {
    const data = await this.repository.getOverviewData(now);
    const summary = data.today;
    const overallPeak = findOverallPeak(data.summaries);
    const isFresh =
      summary !== null &&
      now.getTime() - summary.lastCollectedAt.getTime() <=
        PRESENCE_ONLINE_WINDOW_SECONDS * 1000;

    return {
      status: isFresh ? 'LIVE' : 'DEGRADED',
      timezone: OPERATIONAL_TIME_ZONE,
      heartbeatIntervalSeconds: PRESENCE_HEARTBEAT_INTERVAL_SECONDS,
      onlineWindowSeconds: PRESENCE_ONLINE_WINDOW_SECONDS,
      lastCollectedAt: summary?.lastCollectedAt
        ? formatOperationalDateTime(summary.lastCollectedAt)
        : null,
      onlineNow: summary?.lastObservedOnlineParticipants ?? 0,
      registeredParticipants: data.registeredParticipants,
      uniqueParticipantsEverLogged: data.uniqueParticipantsEverLogged,
      monitoredDays: data.summaries.length,
      today: toTodayResponse(
        summary ?? createEmptySummary(operationalDateUtc(now)),
      ),
      overallPeak: toOverallPeakResponse(overallPeak),
    };
  }

  async getExportData(
    range: { from: Date; to: Date },
    now = new Date(),
  ): Promise<{
    general: PresenceGeneralExportRow;
    daily: PresenceDailyExportRow[];
  }> {
    const [data, summaries] = await Promise.all([
      this.repository.getOverviewData(now),
      this.repository.findDailySummaries(range.from, range.to),
    ]);
    const overallPeak = findOverallPeak(data.summaries);
    const latestCollection = findLatestCollection(data.summaries);

    return {
      general: {
        onlineNow: latestCollection?.lastObservedOnlineParticipants ?? 0,
        overallPeak: overallPeak
          ? {
              operationalDate: overallPeak.operationalDate,
              onlineParticipants: overallPeak.peakOnlineParticipants,
              observedAt: overallPeak.peakAt,
              registeredParticipantsAtPeak:
                overallPeak.registeredParticipantsAtPeak,
            }
          : {
              operationalDate: null,
              onlineParticipants: 0,
              observedAt: null,
              registeredParticipantsAtPeak: 0,
            },
        uniqueParticipantsEverLogged: data.uniqueParticipantsEverLogged,
        registeredParticipants: data.registeredParticipants,
        monitoredDays: data.summaries.length,
        lastCollectedAt: latestCollection?.lastCollectedAt ?? null,
      },
      daily: summaries.map(toDailyExportRow),
    };
  }

  async getDailyHistory(range: { from: Date; to: Date }) {
    const summaries = await this.repository.findDailySummaries(
      range.from,
      range.to,
    );

    return {
      period: {
        from: formatOperationalDateOnly(range.from),
        to: formatOperationalDateOnly(range.to),
      },
      timezone: OPERATIONAL_TIME_ZONE,
      items: [...summaries].sort(compareOperationalDate).map(toHistoryItem),
    };
  }
}

export type PresenceCounts = PresenceCollectionCounts;

function findOverallPeak(
  summaries: PresenceSummaryRecord[],
): PresenceSummaryRecord | null {
  return summaries.reduce<PresenceSummaryRecord | null>(
    (current, candidate) => {
      if (!current) return candidate;
      if (candidate.peakOnlineParticipants !== current.peakOnlineParticipants) {
        return candidate.peakOnlineParticipants > current.peakOnlineParticipants
          ? candidate
          : current;
      }

      if (candidate.peakAt && current.peakAt) {
        const peakTimeDifference =
          candidate.peakAt.getTime() - current.peakAt.getTime();
        if (peakTimeDifference !== 0) {
          return peakTimeDifference < 0 ? candidate : current;
        }
      } else if (candidate.peakAt && !current.peakAt) {
        return candidate;
      } else if (!candidate.peakAt && current.peakAt) {
        return current;
      }

      return candidate.operationalDate.getTime() <
        current.operationalDate.getTime()
        ? candidate
        : current;
    },
    null,
  );
}

function findLatestCollection(
  summaries: PresenceSummaryRecord[],
): PresenceSummaryRecord | null {
  return summaries.reduce<PresenceSummaryRecord | null>(
    (current, candidate) => {
      if (!current) return candidate;
      if (
        candidate.lastCollectedAt.getTime() !==
        current.lastCollectedAt.getTime()
      ) {
        return candidate.lastCollectedAt.getTime() >
          current.lastCollectedAt.getTime()
          ? candidate
          : current;
      }
      return candidate.operationalDate.getTime() >
        current.operationalDate.getTime()
        ? candidate
        : current;
    },
    null,
  );
}

function toTodayResponse(summary: PresenceSummaryRecord) {
  return {
    operationalDate: formatOperationalDateOnly(summary.operationalDate),
    peakOnlineParticipants: summary.peakOnlineParticipants,
    peakAt: summary.peakAt ? formatOperationalDateTime(summary.peakAt) : null,
    registeredParticipantsAtPeak: summary.registeredParticipantsAtPeak,
    uniqueParticipantLogins: summary.uniqueParticipantLogins,
    newParticipantRegistrations: summary.newParticipantRegistrations,
  };
}

function toOverallPeakResponse(summary: PresenceSummaryRecord | null) {
  return summary
    ? {
        operationalDate: formatOperationalDateOnly(summary.operationalDate),
        onlineParticipants: summary.peakOnlineParticipants,
        observedAt: summary.peakAt
          ? formatOperationalDateTime(summary.peakAt)
          : null,
        registeredParticipantsAtPeak: summary.registeredParticipantsAtPeak,
      }
    : {
        operationalDate: null,
        onlineParticipants: 0,
        observedAt: null,
        registeredParticipantsAtPeak: 0,
      };
}

function toHistoryItem(summary: PresenceSummaryRecord) {
  return {
    operationalDate: formatOperationalDateOnly(summary.operationalDate),
    onlineAtLastCollection: summary.lastObservedOnlineParticipants,
    lastCollectedAt: formatOperationalDateTime(summary.lastCollectedAt),
    peakOnlineParticipants: summary.peakOnlineParticipants,
    peakAt: summary.peakAt ? formatOperationalDateTime(summary.peakAt) : null,
    registeredParticipantsAtPeak: summary.registeredParticipantsAtPeak,
    uniqueParticipantLogins: summary.uniqueParticipantLogins,
    newParticipantRegistrations: summary.newParticipantRegistrations,
  };
}

function toDailyExportRow(
  summary: PresenceSummaryRecord,
): PresenceDailyExportRow {
  return {
    operationalDate: summary.operationalDate,
    onlineAtLastCollection: summary.lastObservedOnlineParticipants,
    peakOnlineParticipants: summary.peakOnlineParticipants,
    peakAt: summary.peakAt,
    registeredParticipantsAtPeak: summary.registeredParticipantsAtPeak,
    uniqueParticipantLogins: summary.uniqueParticipantLogins,
    newParticipantRegistrations: summary.newParticipantRegistrations,
    lastCollectedAt: summary.lastCollectedAt,
  };
}

function createEmptySummary(operationalDate: Date): PresenceSummaryRecord {
  return {
    operationalDate,
    lastObservedOnlineParticipants: 0,
    registeredParticipantsAtLastObservation: 0,
    lastCollectedAt: new Date(0),
    peakOnlineParticipants: 0,
    peakAt: null,
    registeredParticipantsAtPeak: 0,
    uniqueParticipantLogins: 0,
    newParticipantRegistrations: 0,
  };
}

function formatOperationalDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function compareOperationalDate(
  first: PresenceSummaryRecord,
  second: PresenceSummaryRecord,
): number {
  return first.operationalDate.getTime() - second.operationalDate.getTime();
}
