import { getAuthCookieOptions } from './cookie-options';

describe('getAuthCookieOptions', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.COOKIE_SAME_SITE;
    delete process.env.COOKIE_SECURE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses lax and insecure cookies by default outside production', () => {
    process.env.NODE_ENV = 'development';

    expect(getAuthCookieOptions(true)).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
    });
  });

  it('uses lax and secure cookies by default in production', () => {
    process.env.NODE_ENV = 'production';

    expect(getAuthCookieOptions(true)).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
    });
  });

  it('uses cross-site cookie options from env', () => {
    process.env.NODE_ENV = 'production';
    process.env.COOKIE_SAME_SITE = 'none';
    process.env.COOKIE_SECURE = 'true';

    expect(getAuthCookieOptions(true)).toMatchObject({
      httpOnly: true,
      sameSite: 'none',
      secure: true,
    });
  });

  it('rejects invalid sameSite env values', () => {
    process.env.COOKIE_SAME_SITE = 'invalid';

    expect(() => getAuthCookieOptions(true)).toThrow(
      'Invalid COOKIE_SAME_SITE environment variable. Use lax, strict, or none.',
    );
  });

  it('rejects cross-site cookies without secure enabled', () => {
    process.env.COOKIE_SAME_SITE = 'none';
    process.env.COOKIE_SECURE = 'false';

    expect(() => getAuthCookieOptions(true)).toThrow(
      'COOKIE_SECURE must be true when COOKIE_SAME_SITE is none.',
    );
  });
});
