import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminParticipantsService } from './admin-participants.service';
import { AdminDashboardRepository } from './admin-dashboard.repository';
import { AdminParticipantsRepository } from './admin-participants.repository';
import { AuditModule } from '../audit/audit.module';
import { AdminAdjustmentsController } from './admin-adjustments.controller';
import { AdminAdjustmentsRepository } from './admin-adjustments.repository';
import { AdminAdjustmentsService } from './admin-adjustments.service';
@Module({
  imports: [AuditModule],
  controllers: [AdminController, AdminAdjustmentsController],
  providers: [
    AdminAdjustmentsService,
    AdminAdjustmentsRepository,
    AdminDashboardService,
    AdminParticipantsService,
    AdminDashboardRepository,
    AdminParticipantsRepository,
  ],
})
export class AdminModule {}
