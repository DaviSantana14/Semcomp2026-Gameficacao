import { SetMetadata } from '@nestjs/common';
import { AdminProfile } from '@prisma/client';

export const ADMIN_PROFILES_KEY = 'admin:profiles';

export const AdminProfiles = (...profiles: AdminProfile[]) =>
  SetMetadata(ADMIN_PROFILES_KEY, profiles);
