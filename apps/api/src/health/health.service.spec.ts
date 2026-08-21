import { ServiceUnavailableException } from '@nestjs/common';
import { HealthRepository } from './health.repository';
import { HealthService } from './health.service';

describe(HealthService.name, () => {
  it('returns a healthy state after querying the database', async () => {
    const checkDatabase = jest.fn().mockResolvedValue(undefined);
    const service = new HealthService({ checkDatabase } as HealthRepository);

    await expect(service.check()).resolves.toEqual({ status: 'ok' });
    expect(checkDatabase).toHaveBeenCalledTimes(1);
  });

  it('returns a generic 503 response when the database is unavailable', async () => {
    const databaseError = new Error('postgresql://user:secret@db:5432/semcomp');
    const checkDatabase = jest.fn().mockRejectedValue(databaseError);
    const service = new HealthService({ checkDatabase } as HealthRepository);

    await expect(service.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await service.check().catch((error: unknown) => {
      const exception = error as ServiceUnavailableException;

      expect(exception.getStatus()).toBe(503);
      expect(JSON.stringify(exception.getResponse())).not.toContain('secret');
      expect(JSON.stringify(exception.getResponse())).not.toContain('db:5432');
    });
  });
});
