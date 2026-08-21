import { Module } from '@nestjs/common';
import { SessionsRepository } from './sessions.repository';
import { SessionsService } from './sessions.service';

@Module({
  providers: [SessionsRepository, SessionsService],
  exports: [SessionsService],
})
export class PresenceModule {}
