import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminParticipantsService } from './admin-participants.service';
@Module({
  controllers: [AdminController],
  providers: [AdminDashboardService, AdminParticipantsService],
})
export class AdminModule {}
