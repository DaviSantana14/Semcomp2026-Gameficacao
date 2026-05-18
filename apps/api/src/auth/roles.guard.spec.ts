import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';
import { RolesGuard } from './roles.guard';

function createExecutionContext(user?: { role: UserRole }) {
  return {
    getHandler: () => 'handler',
    getClass: () => 'Controller',
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows admin users to access admin routes', () => {
    const getAllAndOverrideMock = jest.fn().mockReturnValue([UserRole.ADMIN]);
    const reflector = {
      getAllAndOverride: getAllAndOverrideMock,
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(
      guard.canActivate(createExecutionContext({ role: UserRole.ADMIN })),
    ).toBe(true);
    expect(getAllAndOverrideMock).toHaveBeenCalledWith(ROLES_KEY, [
      'handler',
      'Controller',
    ]);
  });

  it('blocks participant users from admin routes', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.ADMIN]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() =>
      guard.canActivate(createExecutionContext({ role: UserRole.PARTICIPANT })),
    ).toThrow(ForbiddenException);
  });
});
