import { Module } from '@nestjs/common';
import { CsrfGuard } from '../auth/csrf.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ClaimCodesController } from './claim-codes.controller';
import { ClaimCodesService } from './claim-codes.service';

@Module({
  controllers: [ClaimCodesController],
  providers: [ClaimCodesService, CsrfGuard, RolesGuard],
})
export class ClaimCodesModule {}
