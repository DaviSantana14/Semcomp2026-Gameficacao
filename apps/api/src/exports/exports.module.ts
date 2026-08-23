import { Module } from '@nestjs/common';
import { CsrfGuard } from '../auth/csrf.guard';
import { RolesGuard } from '../auth/roles.guard';
import { DownloadGate } from '../common/download-gate';
import { AdminExportsController } from './admin-exports.controller';
import { AdminExportsRepository } from './admin-exports.repository';
import { AdminExportsService } from './admin-exports.service';
import { ExportLimits } from './export-limits';

@Module({
  controllers: [AdminExportsController],
  providers: [
    AdminExportsRepository,
    AdminExportsService,
    DownloadGate,
    ExportLimits,
    CsrfGuard,
    RolesGuard,
  ],
})
export class ExportsModule {}
