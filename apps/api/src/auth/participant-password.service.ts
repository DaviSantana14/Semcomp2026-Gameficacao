import { Injectable } from '@nestjs/common';
import {
  DUMMY_PASSWORD,
  DUMMY_PASSWORD_HASH,
  comparePassword,
  hashPassword,
} from './password-hash';
import {
  ParticipantPasswordValidationError,
  validateParticipantPassword,
} from './participant-password-policy';

export type ParticipantPasswordAuthenticationUser = {
  role: 'PARTICIPANT' | 'ADMIN';
  isActive: boolean;
  passwordHash: string | null;
};

@Injectable()
export class ParticipantPasswordService {
  async hash(password: string) {
    validateParticipantPassword(password);
    return hashPassword(password);
  }

  async verify(
    password: string,
    user: ParticipantPasswordAuthenticationUser | null,
  ) {
    let candidate = password;

    try {
      validateParticipantPassword(password);
    } catch (error) {
      if (error instanceof ParticipantPasswordValidationError) {
        candidate = DUMMY_PASSWORD;
      } else {
        throw error;
      }
    }

    let canAuthenticate = false;
    let passwordHash = DUMMY_PASSWORD_HASH;

    if (
      user?.role === 'PARTICIPANT' &&
      user.isActive &&
      user.passwordHash !== null
    ) {
      canAuthenticate = true;
      passwordHash = user.passwordHash;
    }

    const matches = await comparePassword(candidate, passwordHash);

    return canAuthenticate && matches;
  }
}
