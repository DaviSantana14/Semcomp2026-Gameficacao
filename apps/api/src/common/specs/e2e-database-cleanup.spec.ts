import {
  assertDisposableTestDatabase,
  isDisposableTestDatabase,
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
      assertDisposableTestDatabase(environment, databaseName),
    ).toThrow(/disposable test database/i);
  });
});
