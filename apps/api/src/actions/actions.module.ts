import { Module } from '@nestjs/common';
import { CsrfGuard } from '../auth/csrf.guard';
import { AdminProfilesGuard } from '../auth/admin-profiles.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ActionsController } from './actions.controller';
import { ActionsService } from './actions.service';
import { ActionsRepository } from './actions.repository';
import { AdminActionsController } from './admin-actions.controller';
import { AuditModule } from '../audit/audit.module';
import { DownloadGate } from '../common/download-gate';
import { ClaimCodeArtifactsService } from '../claim-codes/claim-code-artifacts.service';

@Module({
  imports: [AuditModule],
  controllers: [ActionsController, AdminActionsController],
  providers: [
    ActionsService,
    ActionsRepository,
    ClaimCodeArtifactsService,
    DownloadGate,
    CsrfGuard,
    AdminProfilesGuard,
    RolesGuard,
  ],
})
export class ActionsModule {}
