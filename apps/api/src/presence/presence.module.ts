import { Module } from '@nestjs/common';
import { PresenceRepository } from './presence.repository';
import { PresenceSchedulerService } from './presence-scheduler.service';
import { PresenceService } from './presence.service';
import { SessionsRepository } from './sessions.repository';
import { SessionsService } from './sessions.service';

@Module({
  providers: [
    SessionsRepository,
    SessionsService,
    PresenceRepository,
    PresenceService,
    PresenceSchedulerService,
  ],
  exports: [SessionsService, PresenceRepository, PresenceService],
})
export class PresenceModule {}
