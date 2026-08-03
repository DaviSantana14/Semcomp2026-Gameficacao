import { HealthRepository } from './health.repository';

describe(HealthRepository.name, () => {
  it('checks PostgreSQL with a minimal query', async () => {
    const queryRaw = jest
      .fn<Promise<unknown>, [TemplateStringsArray]>()
      .mockResolvedValue([{ '?column?': 1 }]);
    const repository = new HealthRepository({ $queryRaw: queryRaw } as never);

    await expect(repository.checkDatabase()).resolves.toBeUndefined();

    const [query] = queryRaw.mock.calls[0] ?? [];
    expect(Array.from(query)).toEqual(['SELECT 1']);
  });
});
