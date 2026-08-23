import { Module } from '@nestjs/common';
import { CsrfGuard } from '../auth/csrf.guard';
import { AdminProfilesGuard } from '../auth/admin-profiles.guard';
import { AuditController } from './audit.controller';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

@Module({
  controllers: [AuditController],
  providers: [AuditRepository, AuditService, CsrfGuard, AdminProfilesGuard],
  exports: [AuditRepository, AuditService],
})
export class AuditModule {}
