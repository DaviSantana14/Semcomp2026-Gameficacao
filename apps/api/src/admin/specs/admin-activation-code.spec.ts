import {
  ADMIN_ACTIVATION_TTL_MS,
  createAdminActivationCode,
  hashAdminActivationCode,
  normalizeAdminActivationCode,
} from '../admin-activation-code';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

describe('admin activation codes', () => {
  it('creates a formatted 20-symbol code with the required alphabet and TTL', () => {
    const code = createAdminActivationCode();
    const compact = normalizeAdminActivationCode(code);

    expect(ADMIN_ACTIVATION_TTL_MS).toBe(60 * 60 * 1000);
    expect(code).toMatch(/^[A-Z2-9]{5}(?:-[A-Z2-9]{5}){3}$/);
    expect(compact).toHaveLength(20);
    expect([...compact].every((symbol) => ALPHABET.includes(symbol))).toBe(
      true,
    );
  });

  it('normalizes formatted input and hashes only the normalized value', () => {
    const formatted = 'abcde-fghjk-lmnpq-rst23';

    expect(normalizeAdminActivationCode(formatted)).toBe(
      'ABCDEFGHJKLMNPQRST23',
    );
    expect(hashAdminActivationCode(formatted)).toBe(
      hashAdminActivationCode(normalizeAdminActivationCode(formatted)),
    );
    expect(hashAdminActivationCode(formatted)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects malformed codes before they can be looked up', () => {
    expect(() => normalizeAdminActivationCode('short')).toThrow();
    expect(() =>
      normalizeAdminActivationCode('ABCDE-1234I-67890-ABCDE'),
    ).toThrow();
    expect(() =>
      normalizeAdminActivationCode('ABCDE1234567890ABCDE!'),
    ).toThrow();
  });
});
