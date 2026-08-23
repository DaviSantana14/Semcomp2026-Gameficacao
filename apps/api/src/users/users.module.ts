import { Module } from '@nestjs/common';
import { AdminProfilesGuard } from '../auth/admin-profiles.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersRepository, AdminProfilesGuard],
  exports: [UsersService],
})
export class UsersModule {}
