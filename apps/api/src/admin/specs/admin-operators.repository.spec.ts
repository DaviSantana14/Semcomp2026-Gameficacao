import { AdminProfile } from '@prisma/client';
import { AdminOperatorsRepository } from '../admin-operators.repository';

describe(AdminOperatorsRepository.name, () => {
  const auditWriter = { create: jest.fn() };
  const auditRepository = { bindTransaction: jest.fn(() => auditWriter) };
  const prisma = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    user: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    adminActivation: {
      create: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    userSession: { updateMany: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => unknown) => callback(prisma),
    );
  });

  it('binds the audit writer to the same interactive transaction', async () => {
    const repository = new AdminOperatorsRepository(
      prisma as never,
      auditRepository as never,
    );

    await repository.withTransaction((transaction) => {
      expect(transaction.auditWriter).toBe(auditWriter);
      return Promise.resolve('ok');
    });

    expect(auditRepository.bindTransaction).toHaveBeenCalledWith(prisma);
  });

  it('locks available generals in stable id order before removal checks', async () => {
    prisma.$queryRaw.mockResolvedValue([{ id: 'general-1' }]);
    const repository = new AdminOperatorsRepository(
      prisma as never,
      auditRepository as never,
    );

    await expect(repository.lockAvailableGenerals()).resolves.toEqual([
      { id: 'general-1' },
    ]);
    const [template] = prisma.$queryRaw.mock.calls[0] as [TemplateStringsArray];
    expect(template.join('?')).toMatch(
      /"adminProfile" = 'GENERAL'::"AdminProfile"[\s\S]*"passwordHash" IS NOT NULL[\s\S]*ORDER BY "id"[\s\S]*FOR UPDATE/,
    );
  });

  it('locks the target operator and revokes open sessions', async () => {
    prisma.$queryRaw.mockResolvedValue([{ id: 'operator-1' }]);
    prisma.user.findUnique.mockResolvedValue({
      id: 'operator-1',
      role: 'ADMIN',
      adminProfile: AdminProfile.SHOP,
    });
    prisma.userSession.updateMany.mockResolvedValue({ count: 2 });
    const repository = new AdminOperatorsRepository(
      prisma as never,
      auditRepository as never,
    );

    await expect(repository.lockOperator('operator-1')).resolves.toMatchObject({
      id: 'operator-1',
    });
    await expect(
      repository.revokeOpenSessions(
        'operator-1',
        new Date('2026-08-23T12:00:00Z'),
      ),
    ).resolves.toBe(2);
    expect(prisma.userSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({ userId: 'operator-1', endedAt: null }),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ endReason: 'REVOKED' }),
      }),
    );
  });

  it('locks the subject before the activation row during consumption', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([
        { id: 'activation-1', adminUserId: 'operator-1' },
      ])
      .mockResolvedValueOnce([{ id: 'operator-1' }])
      .mockResolvedValueOnce([
        { id: 'activation-1', adminUserId: 'operator-1' },
      ]);
    prisma.adminActivation.findUnique.mockResolvedValue({
      adminUserId: 'operator-1',
      expiresAt: new Date('2026-08-23T13:00:00Z'),
      usedAt: null,
      revokedAt: null,
    });
    prisma.user.findFirst.mockResolvedValue({
      id: 'operator-1',
      name: 'Bia Operadora',
      cpf: '12345678901',
      email: 'bia@example.com',
      role: 'ADMIN',
      adminProfile: AdminProfile.SHOP,
      isActive: true,
      passwordHash: null,
      passwordChangedAt: null,
      lastLoginAt: null,
      createdAt: new Date('2026-08-23T12:00:00Z'),
      updatedAt: new Date('2026-08-23T12:00:00Z'),
      adminActivations: [],
    });
    prisma.user.update.mockResolvedValue({});
    prisma.adminActivation.update.mockResolvedValue({});
    const repository = new AdminOperatorsRepository(
      prisma as never,
      auditRepository as never,
    );

    await repository.consumeActivation({
      codeHash: 'hash',
      cpf: '12345678901',
      email: 'bia@example.com',
      passwordHash: 'password-hash',
      now: new Date('2026-08-23T12:30:00Z'),
    });

    const queries = prisma.$queryRaw.mock.calls as Array<
      [TemplateStringsArray]
    >;
    expect(queries[1]?.[0].join('?')).toMatch(/FROM "User"[\s\S]*FOR UPDATE/);
    expect(queries[2]?.[0].join('?')).toMatch(
      /FROM "AdminActivation"[\s\S]*FOR UPDATE/,
    );
  });
});
