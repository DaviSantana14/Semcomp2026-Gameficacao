import 'dotenv/config';

const requiredEnvVars = [
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'DB_SCHEMA',
] as const;

export function buildDatabaseUrl() {
  const missing = requiredEnvVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing database environment variables: ${missing.join(', ')}`);
  }

  const user = encodeURIComponent(process.env.DB_USER!);
  const password = encodeURIComponent(process.env.DB_PASSWORD!);
  const host = process.env.DB_HOST!;
  const port = process.env.DB_PORT!;
  const database = process.env.DB_NAME!;
  const schema = encodeURIComponent(process.env.DB_SCHEMA!);

  return `postgresql://${user}:${password}@${host}:${port}/${database}?schema=${schema}`;
}

export function ensureDatabaseUrl() {
  process.env.DATABASE_URL ??= buildDatabaseUrl();

  return process.env.DATABASE_URL;
}
