import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ActionsModule } from './actions/actions.module';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { ClaimCodesModule } from './claim-codes/claim-codes.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { PresenceModule } from './presence/presence.module';
import { RankingModule } from './ranking/ranking.module';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { RewardsModule } from './rewards/rewards.module';
import { SecurityModule } from './security/security.module';
import { SecurityHttpMetricsMiddleware } from './security/security-http-metrics.middleware';
import { UsersModule } from './users/users.module';
import { ExportsModule } from './exports/exports.module';

@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
    // Static export paths must be registered before AdminController's :id route.
    ExportsModule,
    AdminModule,
    UsersModule,
    AuthModule,
    AuditModule,
    ActionsModule,
    ClaimCodesModule,
    HealthModule,
    RankingModule,
    RewardsModule,
    SecurityModule,
    PresenceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware, SecurityHttpMetricsMiddleware)
      .forRoutes('{*path}');
  }
}
