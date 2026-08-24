import {
  ParticipantPasswordValidationError,
  validateParticipantPassword,
} from '../participant-password-policy';

describe('validateParticipantPassword', () => {
  it.each(['a'.repeat(8), ' '.repeat(8), 'senha livre', 'é'.repeat(8)])(
    'accepts free-form password %p',
    (password) => {
      expect(() => validateParticipantPassword(password)).not.toThrow();
    },
  );

  it.each(['a'.repeat(7), 'a'.repeat(65), 'é'.repeat(37)])(
    'rejects character or UTF-8 byte overflow %p',
    (password) => {
      expect(() => validateParticipantPassword(password)).toThrow(
        ParticipantPasswordValidationError,
      );
    },
  );

  it('rejects a password over 72 UTF-8 bytes even within 64 characters', () => {
    const password = '😀'.repeat(25);

    expect(Array.from(password).length).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(password, 'utf8')).toBeGreaterThan(72);
    expect(() => validateParticipantPassword(password)).toThrow(
      ParticipantPasswordValidationError,
    );
  });
});
