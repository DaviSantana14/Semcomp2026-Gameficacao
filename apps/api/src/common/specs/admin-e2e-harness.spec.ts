jest.mock('../../../test/support/e2e-database-cleanup', () => ({
  assertDisposableTestDatabase: jest.fn(),
  truncateDisposableTestDatabase: jest.fn().mockResolvedValue(undefined),
}));

import { AdminE2eHarness } from '../../../test/support/admin-e2e-harness';
import { truncateDisposableTestDatabase } from '../../../test/support/e2e-database-cleanup';

describe('AdminE2eHarness.close', () => {
  it('disconnects Prisma after closing the Nest application', async () => {
    const app = { close: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      $disconnect: jest.fn().mockResolvedValue(undefined),
    };
    const harness = Object.assign(Object.create(AdminE2eHarness.prototype), {
      app,
      prisma,
    }) as AdminE2eHarness;

    await harness.close();

    expect(truncateDisposableTestDatabase).toHaveBeenCalledWith(prisma);
    expect(app.close).toHaveBeenCalledTimes(1);
    expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
  });
});
