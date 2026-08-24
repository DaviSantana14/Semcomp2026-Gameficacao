import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminProfile, UserRole } from '@prisma/client';
import { ADMIN_PROFILES_KEY, AdminProfiles } from '../admin-profiles.decorator';
import { AdminProfilesGuard } from '../admin-profiles.guard';

function createExecutionContext(user?: {
  role: UserRole;
  adminProfile: AdminProfile | null;
}) {
  return {
    getHandler: () => 'handler',
    getClass: () => 'Controller',
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('AdminProfiles decorator', () => {
  it('stores the allowed administrative profiles under the stable metadata key', () => {
    function handler() {}

    AdminProfiles(AdminProfile.GENERAL, AdminProfile.SHOP)(
      {} as object,
      'handler',
      { value: handler } as PropertyDescriptor,
    );

    expect(Reflect.getMetadata(ADMIN_PROFILES_KEY, handler)).toEqual([
      AdminProfile.GENERAL,
      AdminProfile.SHOP,
    ]);
  });
});

describe(AdminProfilesGuard.name, () => {
  function createGuard(requiredProfiles: AdminProfile[] | undefined) {
    const getAllAndOverride = jest.fn().mockReturnValue(requiredProfiles);
    const reflector = {
      getAllAndOverride,
    } as unknown as Reflector;

    return {
      guard: new AdminProfilesGuard(reflector),
      getAllAndOverride,
    };
  }

  it('allows an allowed general administrator', () => {
    const { guard } = createGuard([AdminProfile.GENERAL]);

    expect(
      guard.canActivate(
        createExecutionContext({
          role: UserRole.ADMIN,
          adminProfile: AdminProfile.GENERAL,
        }),
      ),
    ).toBe(true);
  });

  it('allows a shop administrator when the route accepts shop access', () => {
    const { guard } = createGuard([AdminProfile.GENERAL, AdminProfile.SHOP]);

    expect(
      guard.canActivate(
        createExecutionContext({
          role: UserRole.ADMIN,
          adminProfile: AdminProfile.SHOP,
        }),
      ),
    ).toBe(true);
  });

  it.each([
    ['an absent user', undefined],
    ['a participant', { role: UserRole.PARTICIPANT, adminProfile: null }],
    [
      'an administrator without a profile',
      { role: UserRole.ADMIN, adminProfile: null },
    ],
    [
      'an administrator with a denied profile',
      { role: UserRole.ADMIN, adminProfile: AdminProfile.SHOP },
    ],
  ] as const)('rejects %s', (_description, user) => {
    const { guard } = createGuard([AdminProfile.GENERAL]);

    expect(() =>
      guard.canActivate(createExecutionContext(user as never)),
    ).toThrow(
      new ForbiddenException({
        statusCode: 403,
        code: 'ADMIN_PROFILE_REQUIRED',
        message: 'Você não tem permissão para acessar este recurso.',
      }),
    );
  });

  it('fails open only when no profile declaration exists', () => {
    const { guard, getAllAndOverride } = createGuard(undefined);

    expect(
      guard.canActivate(
        createExecutionContext({
          role: UserRole.PARTICIPANT,
          adminProfile: null,
        }),
      ),
    ).toBe(true);
    expect(getAllAndOverride.mock.calls).toContainEqual([
      ADMIN_PROFILES_KEY,
      ['handler', 'Controller'],
    ]);
  });
});
