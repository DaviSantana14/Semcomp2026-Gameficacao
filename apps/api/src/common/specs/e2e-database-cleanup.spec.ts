import {
  assertDisposableTestDatabase,
  hasDisposableTestDatabaseConfiguration,
  isDisposableTestDatabase,
  truncateDisposableTestDatabase,
} from '../../../test/support/e2e-database-cleanup';

describe('E2E database cleanup guard', () => {
  it.each(['semcomp_test', 'semcomp-e2e', 'test_semcomp'])(
    'accepts an explicitly disposable database: %s',
    (databaseName) => {
      expect(isDisposableTestDatabase('test', databaseName)).toBe(true);
    },
  );

  it.each([
    ['development', 'semcomp_test'],
    ['test', 'semcomp'],
    ['production', 'semcomp'],
  ])('rejects environment %s with database %s', (environment, databaseName) => {
    expect(isDisposableTestDatabase(environment, databaseName)).toBe(false);
    expect(() =>
      assertDisposableTestDatabase(
        environment,
        databaseName,
        `postgresql://user:password@localhost:5432/${databaseName}`,
      ),
    ).toThrow(/disposable test database/i);
  });

  it('rejects a production DATABASE_URL even when DB_NAME looks disposable', () => {
    expect(() =>
      assertDisposableTestDatabase(
        'test',
        'semcomp_test',
        'postgresql://user:password@localhost:5432/semcomp',
      ),
    ).toThrow(/database_url.*db_name|db_name.*database_url/i);
  });

  it('skips only absent or explicitly non-test database configuration', () => {
    expect(
      hasDisposableTestDatabaseConfiguration(undefined, undefined, undefined),
    ).toBe(false);
    expect(
      hasDisposableTestDatabaseConfiguration(
        'development',
        'semcomp_test',
        'not-a-url',
      ),
    ).toBe(false);
  });

  it('fails preflight clearly for malformed test DATABASE_URL', () => {
    expect(() =>
      hasDisposableTestDatabaseConfiguration(
        'test',
        'semcomp_test',
        'not-a-url',
      ),
    ).toThrow(/malformed.*database_url|database_url.*malformed/i);
  });

  it('fails preflight clearly for inconsistent test database names', () => {
    expect(() =>
      hasDisposableTestDatabaseConfiguration(
        'test',
        'semcomp_test',
        'postgresql://user:password@localhost:5432/other_test',
      ),
    ).toThrow(/database_url.*db_name|db_name.*database_url/i);
  });

  it('checks the connected database before executing destructive cleanup', async () => {
    const originalEnvironment = process.env.NODE_ENV;
    const originalDatabaseName = process.env.DB_NAME;
    const originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';
    process.env.DB_NAME = 'semcomp_test';
    process.env.DATABASE_URL =
      'postgresql://user:password@localhost:5432/semcomp_test';
    const prisma = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValue([{ databaseName: 'semcomp_production' }]),
      $executeRawUnsafe: jest.fn(),
    };

    try {
      await expect(
        truncateDisposableTestDatabase(prisma as never),
      ).rejects.toThrow(/connected database/i);
      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = originalEnvironment;
      process.env.DB_NAME = originalDatabaseName;
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });
});
