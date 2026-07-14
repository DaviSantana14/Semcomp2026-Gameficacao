import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminParticipantsService } from './admin-participants.service';
import { AdminDashboardRepository } from './admin-dashboard.repository';
import { AdminParticipantsRepository } from './admin-participants.repository';
@Module({
  controllers: [AdminController],
  providers: [
    AdminDashboardService,
    AdminParticipantsService,
    AdminDashboardRepository,
    AdminParticipantsRepository,
  ],
})
export class AdminModule {}
