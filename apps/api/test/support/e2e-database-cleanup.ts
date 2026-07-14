import { PrismaService } from '../../src/prisma/prisma.service';

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
): void {
  if (!isDisposableTestDatabase(environment, databaseName)) {
    throw new Error(
      'Refusing E2E cleanup: NODE_ENV and DB_NAME must identify a disposable test database.',
    );
  }
}

export async function truncateDisposableTestDatabase(
  prisma: Pick<PrismaService, '$executeRawUnsafe'>,
): Promise<void> {
  assertDisposableTestDatabase();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "AdminAuditEvent", "PointEvent", "RewardRedemption", "ClaimCode", "Reward", "Action", "User" RESTART IDENTITY CASCADE',
  );
}
