export type SessionRole = 'PARTICIPANT' | 'ADMIN';

export const SESSION_DURATION_MS: Readonly<Record<SessionRole, number>> = {
  PARTICIPANT: 8 * 60 * 60 * 1000,
  ADMIN: 4 * 60 * 60 * 1000,
};

export const SESSION_JWT_TTL: Readonly<Record<SessionRole, '8h' | '4h'>> = {
  PARTICIPANT: '8h',
  ADMIN: '4h',
};
