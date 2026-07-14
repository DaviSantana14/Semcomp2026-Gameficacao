import { Module } from '@nestjs/common';
import { CsrfGuard } from '../auth/csrf.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RewardsController } from './rewards.controller';
import { AdminRewardsController } from './admin-rewards.controller';
import { RewardsService } from './rewards.service';
import { RewardsRepository } from './rewards.repository';

@Module({
  controllers: [RewardsController, AdminRewardsController],
  providers: [RewardsService, RewardsRepository, CsrfGuard, RolesGuard],
})
export class RewardsModule {}
