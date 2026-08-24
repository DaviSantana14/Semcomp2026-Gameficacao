import { compare, hash } from 'bcrypt';

export const BCRYPT_COST = 12;
export const DUMMY_PASSWORD = 'semcomp-dummy-password';
export const DUMMY_PASSWORD_HASH =
  '$2b$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export const hashPassword = (password: string) => hash(password, BCRYPT_COST);

export const comparePassword = (candidate: string, digest: string) =>
  compare(candidate, digest);
