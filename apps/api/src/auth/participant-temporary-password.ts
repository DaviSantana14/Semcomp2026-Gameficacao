import { randomBytes } from 'crypto';
import { validateParticipantPassword } from './participant-password-policy';

export const PARTICIPANT_TEMPORARY_PASSWORD_TTL_MS = 24 * 60 * 60 * 1000;

const TEMPORARY_PASSWORD_BYTES = 15;

export function createParticipantTemporaryPassword(): string {
  const password = randomBytes(TEMPORARY_PASSWORD_BYTES).toString('base64url');
  validateParticipantPassword(password);
  return password;
}
