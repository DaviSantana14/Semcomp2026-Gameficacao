import { Prisma } from '@prisma/client';
import { AdminReconciliationRepository } from '../admin-reconciliation.repository';

describe(AdminReconciliationRepository.name, () => {
  const prisma = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
    pointEvent: { findUnique: jest.fn() },
  };
  const auditRepository = { bindTransaction: jest.fn().mockReturnValue({}) };
  const repository = new AdminReconciliationRepository(
    prisma as never,
    auditRepository as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('uses database aggregation, LEFT JOIN/COALESCE, full ledger and stable pagination', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ total: 3n }])
      .mockResolvedValueOnce([
        {
          participantId: 'p1',
          name: 'Ana',
          email: 'ana@example.test',
          storedPoints: 0,
          storedXp: 0,
          ledgerPoints: 2_147_483_648n,
          ledgerXp: -2_147_483_649n,
          lastEventAt: null,
        },
      ]);

    await expect(
      repository.findPage({
        page: 2,
        limit: 10,
        search: "ana' OR true --",
        divergentOnly: true,
      }),
    ).resolves.toEqual({
      total: 3,
      rows: [
        expect.objectContaining({
          ledgerPoints: 2_147_483_648,
          ledgerXp: -2_147_483_649,
        }),
      ],
    });

    const queries = prisma.$queryRaw.mock.calls.map(([query]) =>
      sqlText(query as Prisma.Sql),
    );
    expect(queries.join('\n')).toMatch(/SUM\(pe\."points"\)/);
    expect(queries.join('\n')).toMatch(/SUM\(pe\."xpDelta"\)/);
    expect(queries.join('\n')).toMatch(/MAX\(pe\."createdAt"\)/);
    expect(queries.join('\n')).toMatch(/LEFT JOIN ledger/);
    expect(queries.join('\n')).toMatch(/COALESCE/);
    expect(queries.join('\n')).not.toMatch(/::integer/);
    expect(queries.join('\n')).not.toMatch(/pe\."source"/);
    expect(queries[1]).toMatch(/cpf ILIKE/);
    expect(queries[1]).toMatch(
      /ORDER BY "participantCreatedAt" DESC, "participantId" DESC/,
    );
    expect(queries[1]).toMatch(/LIMIT.*OFFSET/s);

    const values = prisma.$queryRaw.mock.calls.flatMap(
      ([query]) => (query as Prisma.Sql).values,
    );
    expect(values).toContain("%ana' OR true --%");
    expect(values).toContain(10);
    expect(values).toContain(10);
  });

  it('uses the same database divergence predicate for summary count', async () => {
    prisma.$queryRaw.mockResolvedValue([{ total: 4n }]);
    await expect(repository.countDivergent()).resolves.toBe(4);
    // Jest stores untyped variadic mock calls; assertions cast to Prisma's SQL value.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(sqlText(prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql)).toMatch(
      /"storedPoints" <> "ledgerPoints" OR "storedXp" <> "ledgerXp"/,
    );
  });

  it('returns participant detail from the same aggregated relation', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        participantId: 'p1',
        name: 'Ana',
        email: 'ana@example.test',
        storedPoints: 1,
        storedXp: 2,
        ledgerPoints: 2_147_483_648n,
        ledgerXp: -3n,
        lastEventAt: null,
      },
    ]);
    await expect(repository.findByParticipantId('p1')).resolves.toEqual({
      participantId: 'p1',
      name: 'Ana',
      email: 'ana@example.test',
      storedPoints: 1,
      storedXp: 2,
      ledgerPoints: 2_147_483_648,
      ledgerXp: -3,
      lastEventAt: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const query = prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(sqlText(query)).toMatch(/WHERE "participantId" =/);
    expect(query.values).toContain('p1');
  });

  it('locks the participant before recomputing ledger sums in one transaction', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          { participantId: 'p1', storedPoints: 10, storedXp: 8 },
        ])
        .mockResolvedValueOnce([
          {
            ledgerPoints: -2_147_483_649n,
            ledgerXp: 2_147_483_648n,
            lastEventAt: null,
          },
        ]),
      pointEvent: { findUnique: jest.fn(), create: jest.fn() },
      adminAuditEvent: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    );

    await repository.withTransaction(async (transaction) => {
      await expect(transaction.lockReconciliation('p1')).resolves.toMatchObject(
        {
          participantId: 'p1',
          ledgerPoints: -2_147_483_649,
          ledgerXp: 2_147_483_648,
        },
      );
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(sqlText(tx.$queryRaw.mock.calls[0][0] as Prisma.Sql)).toMatch(
      /FOR UPDATE/,
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(sqlText(tx.$queryRaw.mock.calls[1][0] as Prisma.Sql)).toMatch(
      /SUM\(.*"points"/,
    );
  });

  it('rejects aggregate values outside the JavaScript safe integer range', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        participantId: 'p1',
        name: 'Ana',
        email: 'ana@example.test',
        storedPoints: 0,
        storedXp: 0,
        ledgerPoints: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
        ledgerXp: 0n,
        lastEventAt: null,
      },
    ]);

    await expect(repository.findByParticipantId('p1')).rejects.toThrow(
      'O total agregado excede o limite seguro da aplicação.',
    );
  });
});

function sqlText(query: Prisma.Sql) {
  return query.strings.join('?').replace(/\s+/g, ' ').trim();
}
