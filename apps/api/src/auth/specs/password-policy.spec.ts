import {
  AdminPasswordValidationError,
  validateAdminPassword,
} from '../password-policy';

describe('validateAdminPassword', () => {
  it.each([
    ['12 characters', 'a'.repeat(12)],
    ['64 characters', 'a'.repeat(64)],
    ['72 UTF-8 bytes', `${'a'.repeat(54)}${'é'.repeat(9)}`],
  ])('accepts a password with %s', (_, password) => {
    expect(() => validateAdminPassword(password)).not.toThrow();
  });

  it.each([
    ['11 characters', 'a'.repeat(11)],
    ['65 characters', 'a'.repeat(65)],
    ['73 UTF-8 bytes', `${'a'.repeat(55)}${'é'.repeat(9)}`],
  ])('rejects a password with %s', (_, password) => {
    expect(() => validateAdminPassword(password)).toThrow(
      AdminPasswordValidationError,
    );
  });

  it('rejects a divergent confirmation without modifying the password', () => {
    expect(() =>
      validateAdminPassword('correct-password', 'different-pass'),
    ).toThrow(AdminPasswordValidationError);
  });
});
