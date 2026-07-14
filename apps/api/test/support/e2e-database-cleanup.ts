import type { PrismaService } from '../../src/prisma/prisma.service';

const disposableDatabaseMarker = /(^|[_-])(test|e2e)([_-]|$)/i;

export function isDisposableTestDatabase(
  environment: string | undefined,
  databaseName: string | undefined,
): boolean {
  return (
    environment === 'test' &&
    typeof databaseName === 'string' &&
    disposableDatabaseMarker.test(databaseName)
  );
}

export function assertDisposableTestDatabase(
  environment = process.env.NODE_ENV,
  databaseName = process.env.DB_NAME,
  databaseUrl = process.env.DATABASE_URL,
): void {
  const effectiveDatabaseName = databaseNameFromUrl(databaseUrl);
  if (
    !isDisposableTestDatabase(environment, databaseName) ||
    !isDisposableTestDatabase(environment, effectiveDatabaseName) ||
    databaseName !== effectiveDatabaseName
  ) {
    throw new Error(
      'Refusing E2E cleanup: NODE_ENV, DB_NAME, and DATABASE_URL must identify the same disposable test database.',
    );
  }
}

export function hasDisposableTestDatabaseConfiguration(
  environment = process.env.NODE_ENV,
  databaseName = process.env.DB_NAME,
  databaseUrl = process.env.DATABASE_URL,
): boolean {
  if (environment !== 'test' || !databaseName || !databaseUrl) {
    return false;
  }
  const effectiveDatabaseName = databaseNameFromUrl(databaseUrl);
  if (databaseName !== effectiveDatabaseName) {
    throw new Error(
      'Invalid E2E configuration: DB_NAME and DATABASE_URL must identify the same database.',
    );
  }
  return isDisposableTestDatabase(environment, databaseName);
}

export async function truncateDisposableTestDatabase(
  prisma: Pick<PrismaService, '$queryRawUnsafe' | '$executeRawUnsafe'>,
): Promise<void> {
  assertDisposableTestDatabase();
  const [{ databaseName: connectedDatabaseName } = { databaseName: '' }] =
    await prisma.$queryRawUnsafe<Array<{ databaseName: string }>>(
      'SELECT current_database() AS "databaseName"',
    );
  if (
    !isDisposableTestDatabase(process.env.NODE_ENV, connectedDatabaseName) ||
    connectedDatabaseName !== process.env.DB_NAME
  ) {
    throw new Error(
      'Refusing E2E cleanup: connected database does not match the configured disposable test database.',
    );
  }
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "AdminAuditEvent", "PointEvent", "RewardRedemption", "ClaimCode", "Reward", "Action", "User" RESTART IDENTITY CASCADE',
  );
}

function databaseNameFromUrl(databaseUrl: string | undefined): string {
  if (!databaseUrl) {
    throw new Error('Invalid E2E configuration: DATABASE_URL is missing.');
  }
  try {
    const databaseName = decodeURIComponent(
      new URL(databaseUrl).pathname.replace(/^\//, ''),
    );
    if (!databaseName) {
      throw new Error('empty database name');
    }
    return databaseName;
  } catch {
    throw new Error('Invalid E2E configuration: malformed DATABASE_URL.');
  }
}
