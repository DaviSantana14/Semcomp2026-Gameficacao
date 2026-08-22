import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OPERATIONAL_TIME_ZONE } from '../common/operational-time';
import { PresenceService } from './presence.service';

@Injectable()
export class PresenceSchedulerService {
  private readonly logger = new Logger(PresenceSchedulerService.name);

  constructor(private readonly presence: PresenceService) {}

  @Cron('5 * * * * *', {
    name: 'presence-minute',
    waitForCompletion: true,
  })
  async collectMinute() {
    await this.runSafely('presence_collection_failed', () =>
      this.presence.collect(new Date()),
    );
  }

  @Cron('0 15 3 * * *', {
    name: 'presence-retention',
    timeZone: OPERATIONAL_TIME_ZONE,
    waitForCompletion: true,
  })
  async retain() {
    await this.runSafely('presence_retention_failed', () =>
      this.presence.deleteRetained(new Date()),
    );
  }

  private async runSafely(
    event: string,
    operation: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await operation();
    } catch {
      this.logger.error(`${event} executionId=${randomUUID()}`);
    }
  }
}
