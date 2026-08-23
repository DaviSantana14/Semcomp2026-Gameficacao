jest.mock('@nestjs/passport', () => ({
  AuthGuard: () =>
    class MockPassportGuard {
      canActivate() {
        return true;
      }
    },
}));

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AllowPasswordChangeRequired,
  ALLOW_PASSWORD_CHANGE_REQUIRED_KEY,
} from '../allow-password-change-required.decorator';
import { JwtAuthGuard } from '../jwt-auth.guard';

type RequestUser = {
  passwordResetRequired: boolean;
};

function createExecutionContext(user: RequestUser, allowed = false) {
  class TestController {}
  const handler = () => undefined;

  if (allowed) {
    AllowPasswordChangeRequired()(handler);
  }

  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => handler,
    getClass: () => TestController,
  } as unknown as ExecutionContext;
}

describe(JwtAuthGuard.name, () => {
  it('rejects a temporary participant session on a route without an allow marker', async () => {
    const guard = new JwtAuthGuard(new Reflector());

    await expect(
      guard.canActivate(
        createExecutionContext({ passwordResetRequired: true }),
      ),
    ).rejects.toMatchObject({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      response: expect.objectContaining({
        statusCode: 403,
        code: 'PASSWORD_CHANGE_REQUIRED',
      }),
    });
  });

  it('allows only explicitly marked password-change routes for a temporary session', async () => {
    const guard = new JwtAuthGuard(new Reflector());
    const context = createExecutionContext(
      { passwordResetRequired: true },
      true,
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(
      new Reflector().getAllAndOverride(ALLOW_PASSWORD_CHANGE_REQUIRED_KEY, [
        context.getHandler(),
        context.getClass(),
      ]),
    ).toBe(true);
  });

  it('does not restrict a normal session', async () => {
    const guard = new JwtAuthGuard(new Reflector());

    await expect(
      guard.canActivate(
        createExecutionContext({ passwordResetRequired: false }),
      ),
    ).resolves.toBe(true);
  });

  it('uses the stable forbidden error contract', async () => {
    const guard = new JwtAuthGuard(new Reflector());

    await expect(
      guard.canActivate(
        createExecutionContext({ passwordResetRequired: true }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
