import { Module } from '@nestjs/common';
import { AdminProfilesGuard } from '../auth/admin-profiles.guard';
import { AdminController } from './admin.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminParticipantsService } from './admin-participants.service';
import { AdminDashboardRepository } from './admin-dashboard.repository';
import { AdminParticipantsRepository } from './admin-participants.repository';
import { AuditModule } from '../audit/audit.module';
import { AdminAdjustmentsController } from './admin-adjustments.controller';
import { AdminAdjustmentsRepository } from './admin-adjustments.repository';
import { AdminAdjustmentsService } from './admin-adjustments.service';
import { AdminReconciliationController } from './admin-reconciliation.controller';
import { AdminReconciliationRepository } from './admin-reconciliation.repository';
import { AdminReconciliationService } from './admin-reconciliation.service';
import { PresenceModule } from '../presence/presence.module';
import { AdminPresenceController } from './admin-presence.controller';
@Module({
  imports: [AuditModule, PresenceModule],
  controllers: [
    AdminController,
    AdminAdjustmentsController,
    AdminReconciliationController,
    AdminPresenceController,
  ],
  providers: [
    AdminAdjustmentsService,
    AdminAdjustmentsRepository,
    AdminDashboardService,
    AdminParticipantsService,
    AdminDashboardRepository,
    AdminParticipantsRepository,
    AdminReconciliationService,
    AdminReconciliationRepository,
    AdminProfilesGuard,
  ],
})
export class AdminModule {}
