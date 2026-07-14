import { Module } from '@nestjs/common';
import { CsrfGuard } from '../auth/csrf.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ActionsController } from './actions.controller';
import { ActionsService } from './actions.service';
import { ActionsRepository } from './actions.repository';
import { AdminActionsController } from './admin-actions.controller';

@Module({
  controllers: [ActionsController, AdminActionsController],
  providers: [ActionsService, ActionsRepository, CsrfGuard, RolesGuard],
})
export class ActionsModule {}
