export const PARTICIPANT_PASSWORD_MIN_LENGTH = 8;
export const PARTICIPANT_PASSWORD_MAX_LENGTH = 64;
export const PARTICIPANT_PASSWORD_MAX_UTF8_BYTES = 72;

export class ParticipantPasswordValidationError extends Error {}

export function validateParticipantPassword(password: string): void {
  const characters = Array.from(password).length;

  if (
    characters < PARTICIPANT_PASSWORD_MIN_LENGTH ||
    characters > PARTICIPANT_PASSWORD_MAX_LENGTH ||
    Buffer.byteLength(password, 'utf8') > PARTICIPANT_PASSWORD_MAX_UTF8_BYTES
  ) {
    throw new ParticipantPasswordValidationError(
      'Invalid participant password.',
    );
  }
}
