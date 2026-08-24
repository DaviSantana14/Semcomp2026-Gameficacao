import { hash } from 'bcrypt';
import { AdminProfile, Prisma, UserRole } from '@prisma/client';
import { BCRYPT_COST } from '../src/auth/password-hash';
import type { SeedConfig } from './seed-config';

export async function buildAdminSeedUser(
  config: SeedConfig,
): Promise<Prisma.UserCreateInput> {
  const passwordHash =
    config.mode === 'demo' && config.admin.password !== undefined
      ? await hash(config.admin.password, BCRYPT_COST)
      : undefined;

  return {
    name: config.admin.name,
    cpf: config.admin.cpf,
    email: config.admin.email,
    role: UserRole.ADMIN,
    adminProfile: AdminProfile.GENERAL,
    ...(passwordHash !== undefined ? { passwordHash } : {}),
  };
}
