import { createCredentialRateLimitKey } from './rate-limit-key';

describe('createCredentialRateLimitKey', () => {
  const secret = 'test-rate-limit-secret';

  it('creates the same opaque key for equivalent CPF and email formats', () => {
    const masked = createCredentialRateLimitKey(
      {
        cpf: '123.456.789-01',
        email: ' Ada@Example.COM ',
        route: '/auth/login',
      },
      secret,
    );
    const normalized = createCredentialRateLimitKey(
      {
        cpf: '12345678901',
        email: 'ada@example.com',
        route: '/auth/login',
      },
      secret,
    );

    expect(masked).toBe(normalized);
    expect(masked).toMatch(/^[a-f0-9]{64}$/);
    expect(masked).not.toContain('12345678901');
    expect(masked).not.toContain('ada@example.com');
  });

  it('separates routes and identities without exposing PII', () => {
    const loginKey = createCredentialRateLimitKey(
      {
        cpf: '12345678901',
        email: 'ada@example.com',
        route: '/auth/login',
      },
      secret,
    );
    const adminLoginKey = createCredentialRateLimitKey(
      {
        cpf: '12345678901',
        email: 'ada@example.com',
        route: '/auth/admin/login',
      },
      secret,
    );
    const otherIdentityKey = createCredentialRateLimitKey(
      {
        cpf: '10987654321',
        email: 'bea@example.com',
        route: '/auth/login',
      },
      secret,
    );

    expect(loginKey).not.toBe(adminLoginKey);
    expect(loginKey).not.toBe(otherIdentityKey);
    expect([loginKey, adminLoginKey, otherIdentityKey].join('')).not.toMatch(
      /12345678901|ada@example\.com|10987654321|bea@example\.com/,
    );
  });
});
