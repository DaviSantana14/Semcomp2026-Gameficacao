import { Logger } from '@nestjs/common';
import { PresenceSchedulerService } from '../presence-scheduler.service';

describe(PresenceSchedulerService.name, () => {
  const presence = {
    collect: jest.fn(),
    deleteRetained: jest.fn(),
  };
  let service: PresenceSchedulerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PresenceSchedulerService(presence as never);
  });

  it('runs the minute collection and swallows transient failures with a safe event log', async () => {
    const error = new Error('database details must not be logged');
    presence.collect.mockRejectedValue(error);
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    try {
      await expect(service.collectMinute()).resolves.toBeUndefined();
      expect(presence.collect).toHaveBeenCalledWith(expect.any(Date));
      expect(logger).toHaveBeenCalledWith(
        expect.stringMatching(
          /^presence_collection_failed executionId=[0-9a-f-]+$/,
        ),
      );
      expect(logger.mock.calls[0][0]).not.toContain(error.message);
    } finally {
      logger.mockRestore();
    }
  });

  it('runs retention through the same safe wrapper', async () => {
    presence.deleteRetained.mockResolvedValue(undefined);

    await expect(service.retain()).resolves.toBeUndefined();
    expect(presence.deleteRetained).toHaveBeenCalledWith(expect.any(Date));
  });
});
