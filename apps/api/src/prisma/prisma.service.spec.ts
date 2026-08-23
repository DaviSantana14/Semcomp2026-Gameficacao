jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn(),
}));

jest.mock('pg', () => ({
  Pool: jest.fn(),
}));

import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  const pool = { end: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    jest.mocked(Pool).mockImplementation(() => pool as never);
    jest
      .mocked(PrismaPg)
      .mockImplementation(() => ({ provider: 'postgres' }) as never);
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
  });

  it('disposes an externally provided pg pool when Prisma disconnects', () => {
    new PrismaService();

    expect(PrismaPg).toHaveBeenCalledWith(pool, {
      disposeExternalPool: true,
    });
  });
});
