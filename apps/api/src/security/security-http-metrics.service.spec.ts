import { SecurityHttpMetricsService } from './security-http-metrics.service';

describe(SecurityHttpMetricsService.name, () => {
  const now = new Date('2026-08-22T12:05:10.000Z');
  const buffer = {
    drain: jest.fn(),
    restore: jest.fn(),
  };
  const repository = {
    upsertMinutes: jest.fn(),
    findSince: jest.fn(),
    findLatest: jest.fn(),
    deleteBefore: jest.fn(),
  };
  let service: SecurityHttpMetricsService;

  beforeEach(() => {
    jest.clearAllMocks();
    buffer.drain.mockReturnValue([]);
    repository.upsertMinutes.mockResolvedValue(undefined);
    repository.findSince.mockResolvedValue([]);
    repository.findLatest.mockResolvedValue(null);
    repository.deleteBefore.mockResolvedValue({ count: 0 });
    service = new SecurityHttpMetricsService(
      buffer as never,
      repository as never,
    );
  });

  it('restores a drained batch when additive persistence fails', async () => {
    const batch = [
      {
        minuteStart: new Date('2026-08-22T12:05:00Z'),
        unauthorizedCount: 1,
        forbiddenCount: 0,
        rateLimitedCount: 0,
      },
    ];
    const error = new Error('database unavailable');
    buffer.drain.mockReturnValue(batch);
    repository.upsertMinutes.mockRejectedValue(error);

    await expect(service.flush(now)).rejects.toBe(error);

    expect(buffer.restore).toHaveBeenCalledWith(batch);
  });

  it('aggregates five-minute, hourly and daily windows and flags threshold equality', async () => {
    const rows = [
      {
        minuteStart: new Date('2026-08-22T12:01:00Z'),
        unauthorizedCount: 1,
        forbiddenCount: 2,
        rateLimitedCount: 3,
      },
      {
        minuteStart: new Date('2026-08-22T12:02:00Z'),
        unauthorizedCount: 4,
        forbiddenCount: 5,
        rateLimitedCount: 2,
      },
      {
        minuteStart: new Date('2026-08-22T12:04:00Z'),
        unauthorizedCount: 15,
        forbiddenCount: 3,
        rateLimitedCount: 0,
      },
    ];
    repository.findSince.mockResolvedValue(rows);
    repository.findLatest.mockResolvedValue(rows[2]);

    await expect(service.getOverview(now)).resolves.toEqual({
      status: 'ATTENTION',
      lastFlushedMinute: '2026-08-22T12:04:00.000Z',
      periods: {
        fiveMinutes: { unauthorized: 20, forbidden: 10, rateLimited: 5 },
        oneHour: { unauthorized: 20, forbidden: 10, rateLimited: 5 },
        twentyFourHours: { unauthorized: 20, forbidden: 10, rateLimited: 5 },
      },
      thresholds: {
        unauthorized: 20,
        forbidden: 10,
        rateLimited: 5,
        windowMinutes: 5,
      },
    });
  });

  it('degrades when the last metric minute is more than two minutes stale', async () => {
    const stale = {
      minuteStart: new Date('2026-08-22T12:02:00Z'),
      unauthorizedCount: 0,
      forbiddenCount: 0,
      rateLimitedCount: 0,
    };
    repository.findSince.mockResolvedValue([stale]);
    repository.findLatest.mockResolvedValue(stale);

    await expect(service.getOverview(now)).resolves.toMatchObject({
      status: 'DEGRADED',
      lastFlushedMinute: '2026-08-22T12:02:00.000Z',
    });
  });

  it('keeps an empty metric store normal and exposes no request dimensions', async () => {
    const overview = await service.getOverview(now);

    expect(overview).toMatchObject({
      status: 'NORMAL',
      lastFlushedMinute: null,
      periods: {
        fiveMinutes: { unauthorized: 0, forbidden: 0, rateLimited: 0 },
        oneHour: { unauthorized: 0, forbidden: 0, rateLimited: 0 },
        twentyFourHours: { unauthorized: 0, forbidden: 0, rateLimited: 0 },
      },
    });
    expect(JSON.stringify(overview)).not.toMatch(
      /cpf|email|cookie|jwt|token|request/i,
    );
  });

  it('uses a strict thirty-day retention cutoff', async () => {
    await service.retain(now);

    expect(repository.deleteBefore).toHaveBeenCalledWith(
      new Date('2026-07-23T12:05:10.000Z'),
    );
  });
});
