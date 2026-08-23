import { Module } from '@nestjs/common';
import { CsrfGuard } from '../auth/csrf.guard';
import { AdminProfilesGuard } from '../auth/admin-profiles.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RewardsController } from './rewards.controller';
import { AdminRewardsController } from './admin-rewards.controller';
import { RewardsService } from './rewards.service';
import { RewardsRepository } from './rewards.repository';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [RewardsController, AdminRewardsController],
  providers: [
    RewardsService,
    RewardsRepository,
    CsrfGuard,
    AdminProfilesGuard,
    RolesGuard,
  ],
})
export class RewardsModule {}
