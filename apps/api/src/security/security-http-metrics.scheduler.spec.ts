import { Logger } from '@nestjs/common';
import { SecurityHttpMetricsScheduler } from './security-http-metrics.scheduler';

describe(SecurityHttpMetricsScheduler.name, () => {
  const metrics = {
    flush: jest.fn(),
    retain: jest.fn(),
  };
  let scheduler: SecurityHttpMetricsScheduler;

  beforeEach(() => {
    jest.clearAllMocks();
    metrics.flush.mockResolvedValue(undefined);
    metrics.retain.mockResolvedValue(undefined);
    scheduler = new SecurityHttpMetricsScheduler(metrics as never);
  });

  it('flushes metrics and swallows transient errors without logging details', async () => {
    const error = new Error('database details must not be logged');
    metrics.flush.mockRejectedValue(error);
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    try {
      await expect(scheduler.flushMinute()).resolves.toBeUndefined();
      expect(metrics.flush).toHaveBeenCalledWith(expect.any(Date));
      expect(logger).toHaveBeenCalledWith(
        expect.stringMatching(
          /^security_metrics_flush_failed executionId=[0-9a-f-]+$/,
        ),
      );
      expect(logger.mock.calls[0][0]).not.toContain(error.message);
    } finally {
      logger.mockRestore();
    }
  });

  it('runs retention through the same safe wrapper', async () => {
    await expect(scheduler.retain()).resolves.toBeUndefined();

    expect(metrics.retain).toHaveBeenCalledWith(expect.any(Date));
  });
});
