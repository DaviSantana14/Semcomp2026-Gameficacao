import { Module } from '@nestjs/common';
import { CsrfGuard } from '../auth/csrf.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ClaimCodesController } from './claim-codes.controller';
import { ClaimCodesService } from './claim-codes.service';
import { ClaimCodesRepository } from './claim-codes.repository';
import { AuditModule } from '../audit/audit.module';
import { DownloadGate } from '../common/download-gate';
import { ClaimCodeArtifactsService } from './claim-code-artifacts.service';

@Module({
  imports: [AuditModule],
  controllers: [ClaimCodesController],
  providers: [
    ClaimCodesService,
    ClaimCodesRepository,
    ClaimCodeArtifactsService,
    DownloadGate,
    CsrfGuard,
    RolesGuard,
  ],
})
export class ClaimCodesModule {}
