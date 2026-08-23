import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './app-throttler.guard';
import { RateLimitKey } from './rate-limit-key';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CsrfGuard } from '../auth/csrf.guard';
import { RolesGuard } from '../auth/roles.guard';
import { SecurityHttpMetricsController } from './security-http-metrics.controller';
import { SecurityHttpMetricsBuffer } from './security-http-metrics.buffer';
import { SecurityHttpMetricsMiddleware } from './security-http-metrics.middleware';
import { SecurityHttpMetricsRepository } from './security-http-metrics.repository';
import { SecurityHttpMetricsScheduler } from './security-http-metrics.scheduler';
import { SecurityHttpMetricsService } from './security-http-metrics.service';

function getRateLimitKeySecret() {
  const secret = process.env.RATE_LIMIT_KEY_SECRET;

  if (!secret) {
    throw new Error('Missing RATE_LIMIT_KEY_SECRET environment variable');
  }

  return secret;
}

@Global()
@Module({
  imports: [
    JwtModule.register({ secret: process.env.JWT_SECRET ?? '' }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        limit: 120,
        ttl: 60 * 1000,
      },
    ]),
  ],
  controllers: [SecurityHttpMetricsController],
  providers: [
    {
      provide: RateLimitKey,
      useFactory: () => new RateLimitKey(getRateLimitKeySecret()),
    },
    AppThrottlerGuard,
    SecurityHttpMetricsBuffer,
    SecurityHttpMetricsMiddleware,
    SecurityHttpMetricsRepository,
    SecurityHttpMetricsService,
    SecurityHttpMetricsScheduler,
    JwtAuthGuard,
    CsrfGuard,
    RolesGuard,
    {
      provide: APP_GUARD,
      useExisting: AppThrottlerGuard,
    },
  ],
  exports: [SecurityHttpMetricsService, SecurityHttpMetricsBuffer],
})
export class SecurityModule {}
