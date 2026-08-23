import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { OPERATIONAL_TIME_ZONE } from '../common/operational-time';
import { SecurityHttpMetricsService } from './security-http-metrics.service';

@Injectable()
export class SecurityHttpMetricsScheduler {
  private readonly logger = new Logger(SecurityHttpMetricsScheduler.name);

  constructor(private readonly metrics: SecurityHttpMetricsService) {}

  @Cron('10 * * * * *', {
    name: 'security-http-metrics-flush',
    waitForCompletion: true,
  })
  async flushMinute(): Promise<void> {
    await this.runSafely('security_metrics_flush_failed', () =>
      this.metrics.flush(new Date()),
    );
  }

  @Cron('0 25 3 * * *', {
    name: 'security-http-metrics-retention',
    timeZone: OPERATIONAL_TIME_ZONE,
    waitForCompletion: true,
  })
  async retain(): Promise<void> {
    await this.runSafely('security_metrics_retention_failed', async () => {
      await this.metrics.retain(new Date());
    });
  }

  private async runSafely(
    event: string,
    operation: () => Promise<void>,
  ): Promise<void> {
    try {
      await operation();
    } catch {
      this.logger.error(`${event} executionId=${randomUUID()}`);
    }
  }
}
