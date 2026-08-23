import { GUARDS_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AdminProfile, UserRole } from '@prisma/client';
import { AdminProfilesGuard } from '../admin-profiles.guard';
import { ADMIN_PROFILES_KEY } from '../admin-profiles.decorator';
import { ROLES_KEY } from '../roles.decorator';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { CsrfGuard } from '../csrf.guard';
import { AdminController } from '../../admin/admin.controller';
import { AdminAdjustmentsController } from '../../admin/admin-adjustments.controller';
import { AdminReconciliationController } from '../../admin/admin-reconciliation.controller';
import { AdminPresenceController } from '../../admin/admin-presence.controller';
import { AdminActionsController } from '../../actions/admin-actions.controller';
import { ClaimCodesController } from '../../claim-codes/claim-codes.controller';
import { AdminRewardsController } from '../../rewards/admin-rewards.controller';
import { AuditController } from '../../audit/audit.controller';
import { AdminExportsController } from '../../exports/admin-exports.controller';
import { SecurityHttpMetricsController } from '../../security/security-http-metrics.controller';
import { UsersController } from '../../users/users.controller';

const classRouteCases = [
  { controller: AdminController, profiles: [AdminProfile.GENERAL] },
  {
    controller: AdminAdjustmentsController,
    profiles: [AdminProfile.GENERAL],
  },
  {
    controller: AdminReconciliationController,
    profiles: [AdminProfile.GENERAL],
  },
  { controller: AdminPresenceController, profiles: [AdminProfile.GENERAL] },
  {
    controller: AdminActionsController,
    profiles: [AdminProfile.GENERAL, AdminProfile.ACTIVITIES],
  },
  {
    controller: ClaimCodesController,
    profiles: [AdminProfile.GENERAL, AdminProfile.ACTIVITIES],
  },
  {
    controller: AdminRewardsController,
    profiles: [AdminProfile.GENERAL, AdminProfile.SHOP],
  },
  { controller: AuditController, profiles: [AdminProfile.GENERAL] },
  { controller: AdminExportsController, profiles: [AdminProfile.GENERAL] },
  {
    controller: SecurityHttpMetricsController,
    profiles: [AdminProfile.GENERAL],
  },
] as const;

const methodRouteCases = [
  {
    controller: UsersController,
    method: 'findAll',
    profiles: [AdminProfile.GENERAL],
  },
  {
    controller: UsersController,
    method: 'findById',
    profiles: [AdminProfile.GENERAL],
  },
] as const;

type ControllerConstructor = { prototype: object };

function requestMappedMethods(controller: ControllerConstructor) {
  return Object.getOwnPropertyNames(controller.prototype).filter((name) => {
    if (name === 'constructor') return false;
    const handler = Object.getOwnPropertyDescriptor(controller.prototype, name)
      ?.value as (() => unknown) | undefined;
    return (
      typeof handler === 'function' &&
      Reflect.getMetadata(METHOD_METADATA, handler) !== undefined
    );
  });
}

describe('administrative route profile architecture', () => {
  const reflector = new Reflector();

  it.each(classRouteCases)(
    '$controller.name declares profiles on every mapped method',
    ({ controller, profiles }) => {
      const methods = requestMappedMethods(controller);
      expect(methods.length).toBeGreaterThan(0);
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual(
        expect.arrayContaining([JwtAuthGuard, CsrfGuard, AdminProfilesGuard]),
      );
      expect(Reflect.getMetadata(ROLES_KEY, controller)).not.toEqual([
        UserRole.ADMIN,
      ]);

      for (const method of methods) {
        const handler = Object.getOwnPropertyDescriptor(
          controller.prototype,
          method,
        )?.value as object;
        expect(
          reflector.getAllAndOverride(ADMIN_PROFILES_KEY, [
            handler,
            controller,
          ]),
        ).toEqual(profiles);
        expect(Reflect.getMetadata(ROLES_KEY, handler)).not.toEqual([
          UserRole.ADMIN,
        ]);
      }
    },
  );

  it.each(methodRouteCases)(
    '$controller.name.$method declares profiles on its mapped admin method',
    ({ controller, method, profiles }) => {
      const handler = Object.getOwnPropertyDescriptor(
        controller.prototype,
        method,
      )?.value as object;
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBeDefined();
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual(
        expect.arrayContaining([JwtAuthGuard, AdminProfilesGuard]),
      );
      expect(
        reflector.getAllAndOverride(ADMIN_PROFILES_KEY, [handler, controller]),
      ).toEqual(profiles);
      expect(Reflect.getMetadata(ROLES_KEY, handler)).not.toEqual([
        UserRole.ADMIN,
      ]);
    },
  );
});
