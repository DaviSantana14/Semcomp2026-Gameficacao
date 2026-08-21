export const ADMIN_PASSWORD_MIN_LENGTH = 12;
export const ADMIN_PASSWORD_MAX_LENGTH = 64;
export const ADMIN_PASSWORD_MAX_UTF8_BYTES = 72;

export class AdminPasswordValidationError extends Error {}

export function validateAdminPassword(
  password: string,
  confirmation?: string,
): void {
  const characterLength = Array.from(password).length;

  if (
    characterLength < ADMIN_PASSWORD_MIN_LENGTH ||
    characterLength > ADMIN_PASSWORD_MAX_LENGTH ||
    Buffer.byteLength(password, 'utf8') > ADMIN_PASSWORD_MAX_UTF8_BYTES
  ) {
    throw new AdminPasswordValidationError('Invalid administrator password.');
  }

  if (confirmation !== undefined && password !== confirmation) {
    throw new AdminPasswordValidationError('Invalid administrator password.');
  }
}
