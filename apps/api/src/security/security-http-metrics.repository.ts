import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { SecurityHttpMetricBucket } from './security-http-metrics.buffer';

@Injectable()
export class SecurityHttpMetricsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertMinutes(buckets: readonly SecurityHttpMetricBucket[]) {
    if (buckets.length === 0) {
      return;
    }

    await this.prisma.$transaction(
      buckets.map((bucket) =>
        this.prisma.securityHttpMetricMinute.upsert({
          where: { minuteStart: bucket.minuteStart },
          create: bucket,
          update: {
            unauthorizedCount: { increment: bucket.unauthorizedCount },
            forbiddenCount: { increment: bucket.forbiddenCount },
            rateLimitedCount: { increment: bucket.rateLimitedCount },
          },
        }),
      ),
    );
  }

  async findSince(since: Date): Promise<SecurityHttpMetricBucket[]> {
    const rows = await this.prisma.securityHttpMetricMinute.findMany({
      where: { minuteStart: { gte: since } },
      orderBy: { minuteStart: 'asc' },
    });
    return rows.map(toMetricBucket);
  }

  async findLatest(): Promise<SecurityHttpMetricBucket | null> {
    const row = await this.prisma.securityHttpMetricMinute.findFirst({
      orderBy: { minuteStart: 'desc' },
    });
    return row ? toMetricBucket(row) : null;
  }

  deleteBefore(cutoff: Date) {
    return this.prisma.securityHttpMetricMinute.deleteMany({
      where: { minuteStart: { lt: cutoff } },
    });
  }
}

function toMetricBucket(row: {
  minuteStart: Date;
  unauthorizedCount: number;
  forbiddenCount: number;
  rateLimitedCount: number;
}): SecurityHttpMetricBucket {
  return {
    minuteStart: new Date(row.minuteStart.getTime()),
    unauthorizedCount: row.unauthorizedCount,
    forbiddenCount: row.forbiddenCount,
    rateLimitedCount: row.rateLimitedCount,
  };
}
