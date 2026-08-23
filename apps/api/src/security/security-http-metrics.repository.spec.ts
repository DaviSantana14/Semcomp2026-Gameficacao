import { SecurityHttpMetricsRepository } from './security-http-metrics.repository';

describe(SecurityHttpMetricsRepository.name, () => {
  const metric = {
    minuteStart: new Date('2026-08-22T12:00:00Z'),
    unauthorizedCount: 1,
    forbiddenCount: 2,
    rateLimitedCount: 3,
  };
  const securityHttpMetricMinute = {
    upsert: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    deleteMany: jest.fn(),
  };
  const prisma = {
    securityHttpMetricMinute,
    $transaction: jest.fn(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  };
  let repository: SecurityHttpMetricsRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    securityHttpMetricMinute.upsert.mockResolvedValue(metric);
    securityHttpMetricMinute.findMany.mockResolvedValue([]);
    securityHttpMetricMinute.findFirst.mockResolvedValue(null);
    securityHttpMetricMinute.deleteMany.mockResolvedValue({ count: 0 });
    repository = new SecurityHttpMetricsRepository(prisma as never);
  });

  it('performs additive upserts for each minute bucket', async () => {
    await repository.upsertMinutes([metric]);

    expect(securityHttpMetricMinute.upsert).toHaveBeenCalledWith({
      where: { minuteStart: metric.minuteStart },
      create: metric,
      update: {
        unauthorizedCount: { increment: 1 },
        forbiddenCount: { increment: 2 },
        rateLimitedCount: { increment: 3 },
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('reads a bounded UTC window and the most recent flushed minute', async () => {
    const since = new Date('2026-08-22T11:00:00Z');
    await repository.findSince(since);
    await repository.findLatest();

    expect(securityHttpMetricMinute.findMany).toHaveBeenCalledWith({
      where: { minuteStart: { gte: since } },
      orderBy: { minuteStart: 'asc' },
    });
    expect(securityHttpMetricMinute.findFirst).toHaveBeenCalledWith({
      orderBy: { minuteStart: 'desc' },
    });
  });

  it('retains the exact cutoff minute and deletes only older rows', async () => {
    const cutoff = new Date('2026-07-23T12:00:00Z');

    await repository.deleteBefore(cutoff);

    expect(securityHttpMetricMinute.deleteMany).toHaveBeenCalledWith({
      where: { minuteStart: { lt: cutoff } },
    });
  });
});
