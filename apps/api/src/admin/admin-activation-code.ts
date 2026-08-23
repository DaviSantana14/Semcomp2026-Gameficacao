import { createHash, randomBytes } from 'crypto';

export const ADMIN_ACTIVATION_TTL_MS = 60 * 60 * 1000;
export const ADMIN_ACTIVATION_CODE_LENGTH = 20;
export const ADMIN_ACTIVATION_CODE_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const REJECTION_LIMIT =
  Math.floor(256 / ADMIN_ACTIVATION_CODE_ALPHABET.length) *
  ADMIN_ACTIVATION_CODE_ALPHABET.length;

export function createAdminActivationCode(): string {
  const symbols: string[] = [];

  while (symbols.length < ADMIN_ACTIVATION_CODE_LENGTH) {
    const bytes = randomBytes(32);
    for (const byte of bytes) {
      if (byte >= REJECTION_LIMIT) continue;
      symbols.push(
        ADMIN_ACTIVATION_CODE_ALPHABET[
          byte % ADMIN_ACTIVATION_CODE_ALPHABET.length
        ],
      );
      if (symbols.length === ADMIN_ACTIVATION_CODE_LENGTH) break;
    }
  }

  return symbols.join('').replace(/(.{5})(?=.)/g, '$1-');
}

export function normalizeAdminActivationCode(code: string): string {
  const compact = code.replace(/[\s-]/g, '').toUpperCase();
  const alphabet = new RegExp(
    `^[${ADMIN_ACTIVATION_CODE_ALPHABET}]{${ADMIN_ACTIVATION_CODE_LENGTH}}$`,
  );

  if (!alphabet.test(compact)) {
    throw new Error('Invalid administrator activation code.');
  }

  return compact;
}

export function hashAdminActivationCode(code: string): string {
  return createHash('sha256')
    .update(normalizeAdminActivationCode(code), 'utf8')
    .digest('hex');
}
