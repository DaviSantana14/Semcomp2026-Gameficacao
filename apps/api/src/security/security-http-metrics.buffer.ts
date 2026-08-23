import { Injectable } from '@nestjs/common';

export type SecurityHttpMetricEvent = {
  statusCode: number;
  finishedAt: Date;
};

export type SecurityHttpMetricBucket = {
  minuteStart: Date;
  unauthorizedCount: number;
  forbiddenCount: number;
  rateLimitedCount: number;
};

const MINUTE_IN_MS = 60_000;

export function isSecurityHttpMetricStatus(statusCode: number): boolean {
  return getCountKey(statusCode) !== undefined;
}

@Injectable()
export class SecurityHttpMetricsBuffer {
  private buckets = new Map<number, SecurityHttpMetricBucket>();

  record(event: SecurityHttpMetricEvent): void;
  record(statusCode: number, finishedAt: Date): void;
  record(
    eventOrStatusCode: SecurityHttpMetricEvent | number,
    finishedAt?: Date,
  ): void {
    const statusCode =
      typeof eventOrStatusCode === 'number'
        ? eventOrStatusCode
        : eventOrStatusCode.statusCode;
    const timestamp =
      typeof eventOrStatusCode === 'number'
        ? finishedAt
        : eventOrStatusCode.finishedAt;

    if (!timestamp || !Number.isFinite(timestamp.getTime())) {
      return;
    }

    const countKey = getCountKey(statusCode);
    if (!countKey) {
      return;
    }

    const minuteTimestamp =
      Math.floor(timestamp.getTime() / MINUTE_IN_MS) * MINUTE_IN_MS;
    let bucket = this.buckets.get(minuteTimestamp);
    if (!bucket) {
      bucket = {
        minuteStart: new Date(minuteTimestamp),
        unauthorizedCount: 0,
        forbiddenCount: 0,
        rateLimitedCount: 0,
      };
      this.buckets.set(minuteTimestamp, bucket);
    }

    bucket[countKey] += 1;
  }

  drain(): SecurityHttpMetricBucket[] {
    const drained = this.buckets;
    this.buckets = new Map();

    return [...drained.values()]
      .sort(
        (first, second) =>
          first.minuteStart.getTime() - second.minuteStart.getTime(),
      )
      .map((bucket) => ({
        ...bucket,
        minuteStart: new Date(bucket.minuteStart.getTime()),
      }));
  }

  restore(buckets: readonly SecurityHttpMetricBucket[]): void {
    for (const bucket of buckets) {
      const minuteTimestamp = bucket.minuteStart.getTime();
      if (!Number.isFinite(minuteTimestamp)) {
        continue;
      }

      const current = this.buckets.get(minuteTimestamp);
      if (current) {
        current.unauthorizedCount += bucket.unauthorizedCount;
        current.forbiddenCount += bucket.forbiddenCount;
        current.rateLimitedCount += bucket.rateLimitedCount;
        continue;
      }

      this.buckets.set(minuteTimestamp, {
        minuteStart: new Date(minuteTimestamp),
        unauthorizedCount: bucket.unauthorizedCount,
        forbiddenCount: bucket.forbiddenCount,
        rateLimitedCount: bucket.rateLimitedCount,
      });
    }
  }
}

type CountKey = 'unauthorizedCount' | 'forbiddenCount' | 'rateLimitedCount';

function getCountKey(statusCode: number): CountKey | undefined {
  switch (statusCode) {
    case 401:
      return 'unauthorizedCount';
    case 403:
      return 'forbiddenCount';
    case 429:
      return 'rateLimitedCount';
    default:
      return undefined;
  }
}
