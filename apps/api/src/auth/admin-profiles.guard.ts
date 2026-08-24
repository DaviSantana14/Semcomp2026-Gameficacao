import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminProfile, UserRole } from '@prisma/client';
import { ADMIN_PROFILES_KEY } from './admin-profiles.decorator';

type RequestUser = {
  role?: UserRole;
  adminProfile?: AdminProfile | null;
};

@Injectable()
export class AdminProfilesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const requiredProfiles = this.reflector.getAllAndOverride<
      AdminProfile[] | undefined
    >(ADMIN_PROFILES_KEY, [context.getHandler(), context.getClass()]);

    if (requiredProfiles === undefined) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request.user;

    if (
      user?.role !== UserRole.ADMIN ||
      user.adminProfile == null ||
      !requiredProfiles.includes(user.adminProfile)
    ) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'ADMIN_PROFILE_REQUIRED',
        message: 'Você não tem permissão para acessar este recurso.',
      });
    }

    return true;
  }
}
