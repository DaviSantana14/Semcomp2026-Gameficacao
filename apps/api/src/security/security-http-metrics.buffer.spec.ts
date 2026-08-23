import { SecurityHttpMetricsBuffer } from './security-http-metrics.buffer';

describe(SecurityHttpMetricsBuffer.name, () => {
  it('groups tracked statuses by their UTC minute and drains atomically', () => {
    const buffer = new SecurityHttpMetricsBuffer();

    buffer.record(401, new Date('2026-08-22T12:00:10Z'));
    buffer.record(429, new Date('2026-08-22T12:00:20Z'));
    buffer.record(403, new Date('2026-08-22T12:01:00Z'));
    buffer.record(200, new Date('2026-08-22T12:01:10Z'));

    expect(buffer.drain()).toEqual([
      {
        minuteStart: new Date('2026-08-22T12:00:00Z'),
        unauthorizedCount: 1,
        forbiddenCount: 0,
        rateLimitedCount: 1,
      },
      {
        minuteStart: new Date('2026-08-22T12:01:00Z'),
        unauthorizedCount: 0,
        forbiddenCount: 1,
        rateLimitedCount: 0,
      },
    ]);
    expect(buffer.drain()).toEqual([]);
  });

  it('restores a drained batch without losing events recorded after the swap', () => {
    const buffer = new SecurityHttpMetricsBuffer();
    const firstBatch = {
      minuteStart: new Date('2026-08-22T12:00:00Z'),
      unauthorizedCount: 1,
      forbiddenCount: 0,
      rateLimitedCount: 0,
    };

    buffer.record(403, new Date('2026-08-22T12:00:10Z'));
    const drained = buffer.drain();
    buffer.record(429, new Date('2026-08-22T12:01:10Z'));
    buffer.restore([firstBatch]);

    expect(drained).toEqual([
      {
        minuteStart: new Date('2026-08-22T12:00:00Z'),
        unauthorizedCount: 0,
        forbiddenCount: 1,
        rateLimitedCount: 0,
      },
    ]);
    expect(buffer.drain()).toEqual([
      firstBatch,
      {
        minuteStart: new Date('2026-08-22T12:01:00Z'),
        unauthorizedCount: 0,
        forbiddenCount: 0,
        rateLimitedCount: 1,
      },
    ]);
  });
});
