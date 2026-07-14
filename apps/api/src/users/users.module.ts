import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersRepository, RolesGuard],
  exports: [UsersService],
})
export class UsersModule {}
