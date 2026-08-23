import { validateParticipantPassword } from '../participant-password-policy';
import {
  createParticipantTemporaryPassword,
  PARTICIPANT_TEMPORARY_PASSWORD_TTL_MS,
} from '../participant-temporary-password';

describe('participant temporary password', () => {
  it('creates a 20-character credential accepted by the participant policy', () => {
    const password = createParticipantTemporaryPassword();

    expect(password).toHaveLength(20);
    expect(password).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(() => validateParticipantPassword(password)).not.toThrow();
  });

  it('uses the required 24-hour lifetime', () => {
    expect(PARTICIPANT_TEMPORARY_PASSWORD_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});
