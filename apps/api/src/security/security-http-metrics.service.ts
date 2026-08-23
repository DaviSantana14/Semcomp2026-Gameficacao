import { Injectable } from '@nestjs/common';
import {
  SecurityHttpMetricsBuffer,
  type SecurityHttpMetricBucket,
} from './security-http-metrics.buffer';
import { SecurityHttpMetricsRepository } from './security-http-metrics.repository';

const MINUTE_IN_MS = 60_000;
const DAY_IN_MS = 24 * 60 * MINUTE_IN_MS;
const RETENTION_IN_MS = 30 * DAY_IN_MS;
const STALE_AFTER_IN_MS = 2 * MINUTE_IN_MS;

export const SECURITY_METRIC_THRESHOLDS = {
  unauthorized: 20,
  forbidden: 10,
  rateLimited: 5,
  windowMinutes: 5,
} as const;

export type SecurityMetricPeriod = {
  unauthorized: number;
  forbidden: number;
  rateLimited: number;
};

export type SecurityMetricsOverview = {
  status: 'NORMAL' | 'ATTENTION' | 'DEGRADED';
  lastFlushedMinute: string | null;
  periods: {
    fiveMinutes: SecurityMetricPeriod;
    oneHour: SecurityMetricPeriod;
    twentyFourHours: SecurityMetricPeriod;
  };
  thresholds: typeof SECURITY_METRIC_THRESHOLDS;
};

@Injectable()
export class SecurityHttpMetricsService {
  constructor(
    private readonly buffer: SecurityHttpMetricsBuffer,
    private readonly repository: SecurityHttpMetricsRepository,
  ) {}

  async flush(now = new Date()): Promise<void> {
    void now;
    const buckets = this.buffer.drain();
    if (buckets.length === 0) {
      return;
    }

    try {
      await this.repository.upsertMinutes(buckets);
    } catch (error) {
      this.buffer.restore(buckets);
      throw error;
    }
  }

  async getOverview(now = new Date()): Promise<SecurityMetricsOverview> {
    const currentMinute = startOfMinute(now);
    const firstRetainedMinute = new Date(
      currentMinute.getTime() - (24 * 60 - 1) * MINUTE_IN_MS,
    );
    const [rows, latest] = await Promise.all([
      this.repository.findSince(firstRetainedMinute),
      this.repository.findLatest(),
    ]);

    const fiveMinutes = sumPeriod(
      rows,
      new Date(currentMinute.getTime() - 4 * MINUTE_IN_MS),
      currentMinute,
    );
    const oneHour = sumPeriod(
      rows,
      new Date(currentMinute.getTime() - 59 * MINUTE_IN_MS),
      currentMinute,
    );
    const twentyFourHours = sumPeriod(rows, firstRetainedMinute, currentMinute);
    const lastFlushedAt = latest?.minuteStart ?? null;
    const isStale =
      lastFlushedAt !== null &&
      now.getTime() - lastFlushedAt.getTime() > STALE_AFTER_IN_MS;
    const hasAttention =
      fiveMinutes.unauthorized >= SECURITY_METRIC_THRESHOLDS.unauthorized ||
      fiveMinutes.forbidden >= SECURITY_METRIC_THRESHOLDS.forbidden ||
      fiveMinutes.rateLimited >= SECURITY_METRIC_THRESHOLDS.rateLimited;

    return {
      status: isStale ? 'DEGRADED' : hasAttention ? 'ATTENTION' : 'NORMAL',
      lastFlushedMinute: lastFlushedAt?.toISOString() ?? null,
      periods: { fiveMinutes, oneHour, twentyFourHours },
      thresholds: SECURITY_METRIC_THRESHOLDS,
    };
  }

  retain(now = new Date()) {
    return this.repository.deleteBefore(
      new Date(now.getTime() - RETENTION_IN_MS),
    );
  }
}

function startOfMinute(date: Date) {
  return new Date(Math.floor(date.getTime() / MINUTE_IN_MS) * MINUTE_IN_MS);
}

function sumPeriod(
  rows: readonly SecurityHttpMetricBucket[],
  from: Date,
  to: Date,
): SecurityMetricPeriod {
  return rows
    .filter((row) => row.minuteStart >= from && row.minuteStart <= to)
    .reduce<SecurityMetricPeriod>(
      (period, row) => ({
        unauthorized: period.unauthorized + row.unauthorizedCount,
        forbidden: period.forbidden + row.forbiddenCount,
        rateLimited: period.rateLimited + row.rateLimitedCount,
      }),
      { unauthorized: 0, forbidden: 0, rateLimited: 0 },
    );
}
