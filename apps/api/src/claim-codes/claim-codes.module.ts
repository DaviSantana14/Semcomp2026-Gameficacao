import { Module } from '@nestjs/common';
import { CsrfGuard } from '../auth/csrf.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ClaimCodesController } from './claim-codes.controller';
import { ClaimCodesService } from './claim-codes.service';
import { ClaimCodesRepository } from './claim-codes.repository';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [ClaimCodesController],
  providers: [ClaimCodesService, ClaimCodesRepository, CsrfGuard, RolesGuard],
})
export class ClaimCodesModule {}
