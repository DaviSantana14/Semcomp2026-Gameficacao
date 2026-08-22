import { Injectable } from '@nestjs/common';
import {
  addUtcDays,
  addUtcMonths,
  OPERATIONAL_TIME_ZONE,
  operationalDateUtc,
  startOfOperationalDayUtc,
} from '../common/operational-time';
import {
  ONLINE_WINDOW_SECONDS,
  PresenceRepository,
  PresenceCollectionCounts,
} from './presence.repository';
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

  getDailyHistory(range: { from: Date; to: Date }) {
    return this.repository.findDailySummaries(range.from, range.to);
  }

  async getOverview(now = new Date()) {
    const today = operationalDateUtc(now);
    const summary = await this.repository.findDailySummary(today);
    return {
      timezone: OPERATIONAL_TIME_ZONE,
      heartbeatIntervalSeconds: PRESENCE_HEARTBEAT_INTERVAL_SECONDS,
      onlineWindowSeconds: PRESENCE_ONLINE_WINDOW_SECONDS,
      today: summary,
    };
  }
}

export type PresenceCounts = PresenceCollectionCounts;
