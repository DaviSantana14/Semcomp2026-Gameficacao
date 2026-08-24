import {
  createCredentialRateLimitKey,
  serializeCredentialRateLimitInput,
} from './rate-limit-key';

describe('createCredentialRateLimitKey', () => {
  const secret = 'test-rate-limit-secret';

  it('creates the same opaque v2 key for equivalent participant email formats', () => {
    const masked = createCredentialRateLimitKey(
      {
        route: '/auth/login',
        email: ' Ada@Example.COM ',
      },
      secret,
    );
    const normalized = createCredentialRateLimitKey(
      {
        route: '/auth/login',
        email: 'ada@example.com',
        cpf: null,
      },
      secret,
    );

    expect(masked).toBe(normalized);
    expect(masked).toMatch(/^[a-f0-9]{64}$/);
    expect(masked).not.toContain('ada@example.com');
  });

  it('includes the normalized CPF for administrator and registration routes', () => {
    const maskedCpf = createCredentialRateLimitKey(
      {
        route: '/auth/admin/login',
        email: 'admin@example.com',
        cpf: '529.982.247-25',
      },
      secret,
    );
    const normalizedCpf = createCredentialRateLimitKey(
      {
        route: '/auth/admin/login',
        email: 'admin@example.com',
        cpf: '52998224725',
      },
      secret,
    );

    expect(maskedCpf).toBe(normalizedCpf);
    expect(maskedCpf).toMatch(/^[a-f0-9]{64}$/);
    expect(maskedCpf).not.toContain('52998224725');
  });

  it('separates routes, CPF presence and identities without exposing PII', () => {
    const participantLogin = createCredentialRateLimitKey(
      {
        route: '/auth/login',
        email: 'ada@example.com',
      },
      secret,
    );
    const registerWithCpf = createCredentialRateLimitKey(
      {
        route: '/auth/register',
        email: 'ada@example.com',
        cpf: '52998224725',
      },
      secret,
    );
    const registerWithoutCpf = createCredentialRateLimitKey(
      {
        route: '/auth/register',
        email: 'ada@example.com',
      },
      secret,
    );
    const otherIdentityLogin = createCredentialRateLimitKey(
      {
        route: '/auth/login',
        email: 'bea@example.com',
      },
      secret,
    );

    expect(
      new Set([
        participantLogin,
        registerWithCpf,
        registerWithoutCpf,
        otherIdentityLogin,
      ]).size,
    ).toBe(4);
    expect(
      [
        participantLogin,
        registerWithCpf,
        registerWithoutCpf,
        otherIdentityLogin,
      ].join(''),
    ).not.toMatch(/52998224725|ada@example\.com|bea@example\.com/);
  });

  it('serializes the documented versioned input array', () => {
    expect(
      serializeCredentialRateLimitInput({
        route: '/auth/login',
        email: ' Ada@Example.COM ',
      }),
    ).toBe(JSON.stringify(['v2', '/auth/login', null, 'ada@example.com']));

    expect(
      serializeCredentialRateLimitInput({
        route: '/auth/admin/login',
        email: 'admin@example.com',
        cpf: '529.982.247-25',
      }),
    ).toBe(
      JSON.stringify([
        'v2',
        '/auth/admin/login',
        '52998224725',
        'admin@example.com',
      ]),
    );
  });
});
