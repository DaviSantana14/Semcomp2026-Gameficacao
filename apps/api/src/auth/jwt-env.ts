import 'dotenv/config';

export function ensureJwtSecret() {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new Error('Missing JWT_SECRET environment variable');
  }

  return jwtSecret;
}
