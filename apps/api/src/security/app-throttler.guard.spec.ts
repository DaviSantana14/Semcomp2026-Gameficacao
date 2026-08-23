import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import type {
  ThrottlerModuleOptions,
  ThrottlerStorage,
  ThrottlerStorageRecord,
} from '@nestjs/throttler';
import {
  AppThrottlerGuard,
  type RateLimitedRequest,
} from './app-throttler.guard';
import { RateLimitPolicy } from './rate-limit-policy.decorator';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RateLimitKey } from './rate-limit-key';
import {
  AdminProfiles,
  ADMIN_PROFILES_KEY,
} from '../auth/admin-profiles.decorator';
import { AdminProfile } from '@prisma/client';

const throttlerOptions: ThrottlerModuleOptions = [
  { name: 'default', limit: 5, ttl: 60_000 },
];

function contextFor(
  request: Record<string, unknown>,
  requiredRoles?: UserRole[],
  handler: () => void = function handler() {},
): ExecutionContext {
  class Controller {}

  if (requiredRoles) {
    Reflect.defineMetadata(ROLES_KEY, requiredRoles, handler);
  }

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => request.response,
    }),
    getHandler: () => handler,
    getClass: () => Controller,
  } as unknown as ExecutionContext;
}

class TestableAppThrottlerGuard extends AppThrottlerGuard {
  tracker(request: RateLimitedRequest) {
    return this.getTracker(request);
  }
}

class NamedPolicyController {
  @RateLimitPolicy('export')
  exportFile(this: void) {}

  @RateLimitPolicy('bulk')
  bulkMutation(this: void) {}
}

class ProfileProtectedController {
  @AdminProfiles(AdminProfile.SHOP)
  shopMutation(this: void) {}
}

const emptyStorage: ThrottlerStorage = {
  increment: (): Promise<ThrottlerStorageRecord> =>
    Promise.resolve({
      totalHits: 0,
      timeToExpire: 0,
      isBlocked: false,
      timeToBlockExpire: 0,
    }),
};

describe(AppThrottlerGuard.name, () => {
  it('uses separate HMAC trackers for 150 login identities behind one IP', async () => {
    const guard = new TestableAppThrottlerGuard(
      throttlerOptions,
      emptyStorage,
      new Reflector(),
      new RateLimitKey('test-rate-limit-secret'),
    );

    const trackers = await Promise.all(
      Array.from({ length: 150 }, (_, index) =>
        guard.tracker({
          ip: '203.0.113.10',
          path: '/auth/login',
          body: {
            email: `participant-${index}@example.com`,
          },
        }),
      ),
    );

    expect(new Set(trackers).size).toBe(150);
    expect(trackers.every((tracker) => tracker.startsWith('credential:'))).toBe(
      true,
    );
    expect(trackers.join('')).not.toMatch(/participant-\d+@example\.com/);
  });

  it('includes the normalized CPF in administrator and registration trackers', async () => {
    const guard = new TestableAppThrottlerGuard(
      throttlerOptions,
      emptyStorage,
      new Reflector(),
      new RateLimitKey('test-rate-limit-secret'),
    );
    const base = {
      ip: '203.0.113.10',
      path: '/auth/admin/login',
      body: { cpf: '529.982.247-25', email: 'admin@example.com' },
    };
    const equivalent = {
      ...base,
      body: { cpf: '52998224725', email: ' ADMIN@example.com ' },
    };

    await expect(guard.tracker(base)).resolves.toBe(
      await guard.tracker(equivalent),
    );
    await expect(
      guard.tracker({
        ip: '203.0.113.10',
        path: '/auth/login',
        body: { email: 'admin@example.com' },
      }),
    ).resolves.not.toBe(await guard.tracker(base));
  });

  it('uses an authenticated internal ID before falling back to the IP', async () => {
    const guard = new TestableAppThrottlerGuard(
      throttlerOptions,
      emptyStorage,
      new Reflector(),
      new RateLimitKey('test-rate-limit-secret'),
    );

    await expect(
      guard.tracker({ ip: '203.0.113.10', user: { id: 'user-1' } }),
    ).resolves.toBe('user:user-1');
    await expect(guard.tracker({ ip: '203.0.113.10' })).resolves.toBe(
      'ip:203.0.113.10',
    );
  });

  it('uses the verified JWT subject before falling back to the IP', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-from-jwt' }),
    };
    const guard = new TestableAppThrottlerGuard(
      throttlerOptions,
      emptyStorage,
      new Reflector(),
      new RateLimitKey('test-rate-limit-secret'),
      jwtService as never,
    );

    await expect(
      guard.tracker({
        ip: '203.0.113.10',
        cookies: { access_token: 'signed-access-token' },
      }),
    ).resolves.toBe('user:user-from-jwt');
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('signed-access-token');
  });

  it.each([
    ['/auth/login', 'POST', undefined, 5, 15 * 60 * 1000],
    ['/auth/admin/login', 'POST', undefined, 5, 15 * 60 * 1000],
    ['/auth/register', 'POST', undefined, 3, 60 * 60 * 1000],
    ['/ranking', 'GET', undefined, 120, 60 * 1000],
    ['/actions/redeem-code', 'POST', [UserRole.PARTICIPANT], 10, 60 * 1000],
    ['/admin/actions', 'PATCH', [UserRole.ADMIN], 30, 60 * 1000],
    ['/health', 'GET', undefined, 60, 60 * 1000],
  ])(
    'applies %i requests in %i ms to %s %s',
    async (path, method, requiredRoles, limit, ttl) => {
      const increment = jest
        .fn<
          Promise<ThrottlerStorageRecord>,
          [string, number, number, number, string]
        >()
        .mockResolvedValue({
          totalHits: 1,
          timeToExpire: ttl,
          isBlocked: false,
          timeToBlockExpire: 0,
        });
      const guard = new AppThrottlerGuard(
        throttlerOptions,
        { increment },
        new Reflector(),
        new RateLimitKey('test-rate-limit-secret'),
      );
      await guard.onModuleInit();

      await expect(
        guard.canActivate(
          contextFor(
            {
              ip: '203.0.113.10',
              path,
              method,
              body: { cpf: '12345678901', email: 'ada@example.com' },
              response: { header: jest.fn() },
            },
            requiredRoles,
          ),
        ),
      ).resolves.toBe(true);
      expect(increment).toHaveBeenCalledWith(
        expect.any(String),
        ttl,
        limit,
        ttl,
        'default',
      );
    },
  );

  it('uses the existing admin mutation policy for profile-protected mutations', async () => {
    const increment = jest
      .fn<
        Promise<ThrottlerStorageRecord>,
        [string, number, number, number, string]
      >()
      .mockResolvedValue({
        totalHits: 1,
        timeToExpire: 60_000,
        isBlocked: false,
        timeToBlockExpire: 0,
      });
    const guard = new AppThrottlerGuard(
      throttlerOptions,
      { increment },
      new Reflector(),
      new RateLimitKey('test-rate-limit-secret'),
    );
    await guard.onModuleInit();

    const handler = ProfileProtectedController.prototype.shopMutation;
    await expect(
      guard.canActivate(
        contextFor(
          {
            path: '/rewards/:id',
            method: 'PATCH',
            user: { id: 'shop-admin-1' },
            response: { header: jest.fn() },
          },
          undefined,
          handler,
        ),
      ),
    ).resolves.toBe(true);

    expect(increment).toHaveBeenCalledWith(
      expect.any(String),
      60 * 1000,
      30,
      60 * 1000,
      'default',
    );
    expect(Reflect.getMetadata(ADMIN_PROFILES_KEY, handler)).toEqual([
      AdminProfile.SHOP,
    ]);
  });

  it('shares one counter across endpoints in the same authenticated limit class', async () => {
    const increment = jest
      .fn<
        Promise<ThrottlerStorageRecord>,
        [string, number, number, number, string]
      >()
      .mockResolvedValue({
        totalHits: 1,
        timeToExpire: 60,
        isBlocked: false,
        timeToBlockExpire: 0,
      });
    const guard = new AppThrottlerGuard(
      throttlerOptions,
      { increment },
      new Reflector(),
      new RateLimitKey('test-rate-limit-secret'),
    );
    await guard.onModuleInit();

    await guard.canActivate(
      contextFor(
        {
          ip: '203.0.113.10',
          path: '/ranking',
          method: 'GET',
          user: { id: 'user-1' },
          response: { header: jest.fn() },
        },
        undefined,
        function ranking() {},
      ),
    );
    await guard.canActivate(
      contextFor(
        {
          ip: '203.0.113.10',
          path: '/rewards',
          method: 'GET',
          user: { id: 'user-1' },
          response: { header: jest.fn() },
        },
        undefined,
        function rewards() {},
      ),
    );

    expect(increment.mock.calls[0]?.[0]).toBe(increment.mock.calls[1]?.[0]);
  });

  it.each([
    ['export', NamedPolicyController.prototype.exportFile, 5],
    ['bulk', NamedPolicyController.prototype.bulkMutation, 2],
  ] as const)(
    'applies the named %s policy before the method fallback',
    async (_policy, handler, limit) => {
      const increment = jest
        .fn<
          Promise<ThrottlerStorageRecord>,
          [string, number, number, number, string]
        >()
        .mockResolvedValue({
          totalHits: 1,
          timeToExpire: 60_000,
          isBlocked: false,
          timeToBlockExpire: 0,
        });
      const guard = new AppThrottlerGuard(
        throttlerOptions,
        { increment },
        new Reflector(),
        new RateLimitKey('test-rate-limit-secret'),
      );
      await guard.onModuleInit();

      await expect(
        guard.canActivate(
          contextFor(
            {
              ip: '203.0.113.10',
              path: '/admin/some-route',
              method: 'GET',
              user: { id: 'admin-1' },
              response: { header: jest.fn() },
            },
            undefined,
            handler,
          ),
        ),
      ).resolves.toBe(true);

      expect(increment).toHaveBeenCalledWith(
        expect.any(String),
        60_000,
        limit,
        60_000,
        'default',
      );
    },
  );

  it('shares named export counters without sharing the common admin mutation counter', async () => {
    const increment = jest
      .fn<
        Promise<ThrottlerStorageRecord>,
        [string, number, number, number, string]
      >()
      .mockResolvedValue({
        totalHits: 1,
        timeToExpire: 60_000,
        isBlocked: false,
        timeToBlockExpire: 0,
      });
    const guard = new AppThrottlerGuard(
      throttlerOptions,
      { increment },
      new Reflector(),
      new RateLimitKey('test-rate-limit-secret'),
    );
    await guard.onModuleInit();

    const request = {
      ip: '203.0.113.10',
      method: 'GET',
      user: { id: 'admin-1' },
      response: { header: jest.fn() },
    };
    await guard.canActivate(
      contextFor(
        { ...request, path: '/admin/participants/export.csv' },
        undefined,
        NamedPolicyController.prototype.exportFile,
      ),
    );
    await guard.canActivate(
      contextFor(
        { ...request, path: '/admin/redemptions/export.csv' },
        undefined,
        NamedPolicyController.prototype.exportFile,
      ),
    );
    await guard.canActivate(
      contextFor(
        { ...request, path: '/admin/actions' },
        [UserRole.ADMIN],
        function adminMutation() {},
      ),
    );

    expect(increment.mock.calls[0]?.[0]).toBe(increment.mock.calls[1]?.[0]);
    expect(increment.mock.calls[1]?.[0]).not.toBe(increment.mock.calls[2]?.[0]);
  });

  it('returns 429 with retry and limit headers without exposing the tracker', async () => {
    const header = jest.fn<void, [string, number]>();
    const response = { header };
    const increment = jest
      .fn<
        Promise<ThrottlerStorageRecord>,
        [string, number, number, number, string]
      >()
      .mockResolvedValue({
        totalHits: 6,
        timeToExpire: 45,
        isBlocked: true,
        timeToBlockExpire: 45,
      });
    const storage: ThrottlerStorage = { increment };
    const guard = new AppThrottlerGuard(
      throttlerOptions,
      storage,
      new Reflector(),
      new RateLimitKey('test-rate-limit-secret'),
    );
    await guard.onModuleInit();
    const request = {
      ip: '203.0.113.10',
      path: '/auth/login',
      body: { cpf: '12345678901', email: 'ada@example.com' },
      response,
    };

    await expect(guard.canActivate(contextFor(request))).rejects.toMatchObject({
      status: 429,
    });
    expect(header).toHaveBeenCalledWith('Retry-After', 45);
    expect(header).toHaveBeenCalledWith('X-RateLimit-Limit', 5);
    expect(header).toHaveBeenCalledWith('X-RateLimit-Remaining', 0);
    expect(header).toHaveBeenCalledWith('X-RateLimit-Reset', 45);
    expect(JSON.stringify(increment.mock.calls)).not.toContain('12345678901');
    expect(JSON.stringify(increment.mock.calls)).not.toContain(
      'ada@example.com',
    );
  });
});
