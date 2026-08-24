import { Injectable } from '@nestjs/common';
import {
  DUMMY_PASSWORD,
  DUMMY_PASSWORD_HASH,
  comparePassword,
  hashPassword,
} from './password-hash';
import {
  AdminPasswordValidationError,
  validateAdminPassword,
} from './password-policy';

export type AdminPasswordAuthenticationUser = {
  role: 'PARTICIPANT' | 'ADMIN';
  isActive: boolean;
  passwordHash: string | null;
};

@Injectable()
export class AdminPasswordService {
  async hash(password: string) {
    validateAdminPassword(password);
    return hashPassword(password);
  }

  async verify(password: string, user: AdminPasswordAuthenticationUser | null) {
    let candidate = password;

    try {
      validateAdminPassword(password);
    } catch (error) {
      if (error instanceof AdminPasswordValidationError) {
        candidate = DUMMY_PASSWORD;
      } else {
        throw error;
      }
    }

    let canAuthenticate = false;
    let passwordHash = DUMMY_PASSWORD_HASH;

    if (user?.role === 'ADMIN' && user.isActive && user.passwordHash !== null) {
      canAuthenticate = true;
      passwordHash = user.passwordHash;
    }

    const matches = await comparePassword(candidate, passwordHash);

    return canAuthenticate && matches;
  }
}
