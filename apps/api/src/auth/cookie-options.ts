import type { CookieOptions } from 'express';
import {
  SESSION_DURATION_MS,
  type SessionRole,
} from '../common/session-duration';

type SameSiteOption = 'lax' | 'strict' | 'none';

function parseCookieSameSite(value: string | undefined): SameSiteOption {
  if (!value) {
    return 'lax';
  }

  const normalizedValue = value.trim().toLowerCase();

  if (
    normalizedValue === 'lax' ||
    normalizedValue === 'strict' ||
    normalizedValue === 'none'
  ) {
    return normalizedValue;
  }

  throw new Error(
    'Invalid COOKIE_SAME_SITE environment variable. Use lax, strict, or none.',
  );
}

function parseCookieSecure(value: string | undefined): boolean {
  if (!value) {
    return process.env.NODE_ENV === 'production';
  }

  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue === 'true') {
    return true;
  }

  if (normalizedValue === 'false') {
    return false;
  }

  throw new Error(
    'Invalid COOKIE_SECURE environment variable. Use true or false.',
  );
}

function getAuthCookieBaseOptions(httpOnly: boolean): CookieOptions {
  const secure = parseCookieSecure(process.env.COOKIE_SECURE);
  const sameSite = parseCookieSameSite(process.env.COOKIE_SAME_SITE);

  if (sameSite === 'none' && !secure) {
    throw new Error(
      'COOKIE_SECURE must be true when COOKIE_SAME_SITE is none.',
    );
  }

  return {
    httpOnly,
    secure,
    sameSite,
    path: '/',
  };
}

export function getAuthCookieOptions(
  httpOnly: boolean,
  role: SessionRole,
): CookieOptions {
  return {
    ...getAuthCookieBaseOptions(httpOnly),
    maxAge: SESSION_DURATION_MS[role],
  };
}

export function getClearAuthCookieOptions(): CookieOptions {
  return getAuthCookieBaseOptions(true);
}
