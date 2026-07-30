import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './app-throttler.guard';
import { RateLimitKey } from './rate-limit-key';

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
  providers: [
    {
      provide: RateLimitKey,
      useFactory: () => new RateLimitKey(getRateLimitKeySecret()),
    },
    AppThrottlerGuard,
    {
      provide: APP_GUARD,
      useExisting: AppThrottlerGuard,
    },
  ],
})
export class SecurityModule {}
