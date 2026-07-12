import { Module } from '@nestjs/common';
import { ActionsModule } from './actions/actions.module';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ClaimCodesModule } from './claim-codes/claim-codes.module';
import { PrismaModule } from './prisma/prisma.module';
import { RankingModule } from './ranking/ranking.module';
import { RewardsModule } from './rewards/rewards.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    PrismaModule,
    AdminModule,
    UsersModule,
    AuthModule,
    ActionsModule,
    ClaimCodesModule,
    RankingModule,
    RewardsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
