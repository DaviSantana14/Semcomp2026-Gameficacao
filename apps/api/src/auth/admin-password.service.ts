import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { compare, hash } from 'bcrypt';
import {
  AdminPasswordValidationError,
  validateAdminPassword,
} from './password-policy';

const BCRYPT_COST = 12;
const DUMMY_PASSWORD_HASH =
  '$2b$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export type AdminPasswordAuthenticationUser = {
  role: UserRole;
  isActive: boolean;
  passwordHash: string | null;
};

@Injectable()
export class AdminPasswordService {
  async hash(password: string) {
    validateAdminPassword(password);
    return hash(password, BCRYPT_COST);
  }

  async verify(password: string, user: AdminPasswordAuthenticationUser | null) {
    try {
      validateAdminPassword(password);
    } catch (error) {
      if (error instanceof AdminPasswordValidationError) {
        return false;
      }
      throw error;
    }

    let canAuthenticate = false;
    let passwordHash = DUMMY_PASSWORD_HASH;

    if (
      user?.role === UserRole.ADMIN &&
      user.isActive &&
      user.passwordHash !== null
    ) {
      canAuthenticate = true;
      passwordHash = user.passwordHash;
    }

    const matches = await compare(password, passwordHash);

    return canAuthenticate && matches;
  }
}
