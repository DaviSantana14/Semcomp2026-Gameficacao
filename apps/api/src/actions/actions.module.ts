import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { ActionsController } from './actions.controller';
import { ActionsService } from './actions.service';

@Module({
  controllers: [ActionsController],
  providers: [ActionsService, RolesGuard],
})
export class ActionsModule {}
