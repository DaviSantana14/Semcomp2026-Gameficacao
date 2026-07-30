import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

describe(HealthService.name, () => {
  it('returns a healthy state after querying the database', async () => {
    const queryRaw = jest
      .fn<Promise<unknown>, [TemplateStringsArray]>()
      .mockResolvedValue([{ '?column?': 1 }]);
    const service = new HealthService({ $queryRaw: queryRaw } as PrismaService);

    await expect(service.check()).resolves.toEqual({ status: 'ok' });

    const [query] = queryRaw.mock.calls[0] ?? [];
    expect(Array.from(query)).toEqual(['SELECT 1']);
  });

  it('returns a generic 503 response when the database is unavailable', async () => {
    const databaseError = new Error('postgresql://user:secret@db:5432/semcomp');
    const queryRaw = jest
      .fn<Promise<unknown>, [TemplateStringsArray]>()
      .mockRejectedValue(databaseError);
    const service = new HealthService({ $queryRaw: queryRaw } as PrismaService);

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
