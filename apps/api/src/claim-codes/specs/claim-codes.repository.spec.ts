import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as eventCode from '../../common/event-code';
import { ClaimCodesRepository } from '../claim-codes.repository';
import { ClaimCodesService } from '../claim-codes.service';

function createRepository() {
  const claimCode = {
    count: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    createManyAndReturn: jest.fn(),
    updateMany: jest.fn(),
  };
  const action = { findUnique: jest.fn() };
  const tx = { action, claimCode };
  const prisma = {
    action,
    claimCode,
    $transaction: jest.fn(
      (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };

  const persistenceRepository = new ClaimCodesRepository(prisma as never);
  return {
    repository: new ClaimCodesService(persistenceRepository, {
      record: jest.fn(),
    } as never),
    prisma,
  };
}

const context = { actorAdminId: 'admin-1', requestId: 'request-1' };

function updateStatus(
  service: ClaimCodesService,
  id: string,
  isActive: boolean,
) {
  return service.updateStatus(
    id,
    { isActive, reason: 'Alteracao administrativa do codigo' },
    context,
  );
}

function generateBatch(
  service: ClaimCodesService,
  actionId: string,
  quantity: number,
) {
  return service.generateBatch(
    actionId,
    { quantity, reason: 'Geracao administrativa do lote' },
    context,
  );
}

describe('ClaimCodesRepository', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    [{ isUsed: true, isActive: false, action: { isActive: true } }, 'USED'],
    [
      { isUsed: false, isActive: false, action: { isActive: true } },
      'DISABLED',
    ],
    [
      { isUsed: false, isActive: true, action: { isActive: false } },
      'BLOCKED_BY_ACTION',
    ],
    [
      { isUsed: false, isActive: true, action: { isActive: true } },
      'AVAILABLE',
    ],
  ])('derives claim-code status with USED precedence', async (row, status) => {
    const { repository, prisma } = createRepository();
    prisma.claimCode.count.mockResolvedValue(1);
    prisma.claimCode.findMany.mockResolvedValue([
      {
        id: 'c1',
        code: 'AAAA-AAAA',
        createdAt: new Date('2026-01-01'),
        usedAt: null,
        usedBy: null,
        ...row,
        action: { id: 'a1', name: 'A', ...row.action },
      },
    ]);

    const result = await repository.findAll({ page: 1, limit: 20 });
    expect(result.items[0].status).toBe(status);
  });

  it('filters by action, normalizes search and uses stable server pagination with minimal selects', async () => {
    const { repository, prisma } = createRepository();
    prisma.claimCode.count.mockResolvedValue(0);
    prisma.claimCode.findMany.mockResolvedValue([]);
    await repository.findAll({
      page: 2,
      limit: 10,
      actionId: 'a1',
      search: ' abcd-efgh ',
    });
    const where = { actionId: 'a1', code: { contains: 'ABCD-EFGH' } };
    expect(prisma.claimCode.count).toHaveBeenCalledWith({ where });
    expect(prisma.claimCode.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        skip: 10,
        take: 10,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        // Jest matchers are intentionally dynamic in this mock assertion.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        select: expect.objectContaining({
          action: { select: { id: true, name: true, isActive: true } },
          usedBy: { select: { id: true, name: true, email: true } },
        }),
      }),
    );
  });

  it.each([
    [
      'available',
      { isUsed: false, isActive: true, action: { isActive: true } },
    ],
    ['disabled', { isUsed: false, isActive: false }],
    ['blocked', { isUsed: false, isActive: true, action: { isActive: false } }],
    ['used', { isUsed: true }],
  ] as const)(
    'filters claim codes by %s status',
    async (status, expectedStatusWhere) => {
      const { repository, prisma } = createRepository();
      prisma.claimCode.count.mockResolvedValue(0);
      prisma.claimCode.findMany.mockResolvedValue([]);

      await repository.findAll({ page: 1, limit: 10, status });

      expect(prisma.claimCode.count).toHaveBeenCalledWith({
        where: expectedStatusWhere,
      });
    },
  );

  it.each([
    [false, 'DISABLED'],
    [true, 'AVAILABLE'],
  ])('toggles an unused code to %s conditionally', async (isActive, status) => {
    const { repository, prisma } = createRepository();
    prisma.claimCode.updateMany.mockResolvedValue({ count: 1 });
    prisma.claimCode.findUnique
      .mockResolvedValueOnce({
        id: 'c1',
        code: 'AAAA-AAAA',
        isUsed: false,
        isActive: !isActive,
        action: { isActive: true },
      })
      .mockResolvedValueOnce({
        id: 'c1',
        code: 'AAAA-AAAA',
        isUsed: false,
        isActive,
        action: { isActive: true },
      });
    await expect(
      updateStatus(repository, 'c1', isActive),
    ).resolves.toMatchObject({ status });
    expect(prisma.claimCode.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', isUsed: false },
      data: { isActive },
    });
  });

  it('allows activation while the action is inactive', async () => {
    const { repository, prisma } = createRepository();
    prisma.claimCode.updateMany.mockResolvedValue({ count: 1 });
    prisma.claimCode.findUnique
      .mockResolvedValueOnce({
        id: 'c1',
        code: 'AAAA-AAAA',
        isUsed: false,
        isActive: false,
        action: { isActive: false },
      })
      .mockResolvedValueOnce({
        id: 'c1',
        code: 'AAAA-AAAA',
        isUsed: false,
        isActive: true,
        action: { isActive: false },
      });
    await expect(updateStatus(repository, 'c1', true)).resolves.toMatchObject({
      status: 'BLOCKED_BY_ACTION',
    });
  });

  it('returns 404 when toggled code does not exist', async () => {
    const { repository, prisma } = createRepository();
    prisma.claimCode.updateMany.mockResolvedValue({ count: 0 });
    prisma.claimCode.findUnique.mockResolvedValue(null);
    await expect(updateStatus(repository, 'missing', false)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns 409 for used code, including a concurrent consumption', async () => {
    const { repository, prisma } = createRepository();
    prisma.claimCode.updateMany.mockResolvedValue({ count: 0 });
    prisma.claimCode.findUnique.mockResolvedValue({ id: 'c1', isUsed: true });
    await expect(updateStatus(repository, 'c1', false)).rejects.toThrow(
      ConflictException,
    );
  });

  it('throws when the action does not exist', async () => {
    const { repository, prisma } = createRepository();
    prisma.action.findUnique.mockResolvedValue(null);

    await expect(generateBatch(repository, 'missing', 2)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.claimCode.createManyAndReturn).not.toHaveBeenCalled();
  });

  it('generates an ordered batch for an active action', async () => {
    const { repository, prisma } = createRepository();
    prisma.action.findUnique.mockResolvedValue({
      id: 'action-1',
      name: 'Credenciamento',
    });
    jest
      .spyOn(eventCode, 'generateClaimCode')
      .mockReturnValueOnce('CCCC-CCCC')
      .mockReturnValueOnce('AAAA-AAAA')
      .mockReturnValueOnce('BBBB-BBBB');
    prisma.claimCode.createManyAndReturn.mockResolvedValue([
      { code: 'CCCC-CCCC' },
      { code: 'AAAA-AAAA' },
      { code: 'BBBB-BBBB' },
    ]);

    await expect(generateBatch(repository, 'action-1', 3)).resolves.toEqual({
      action: { id: 'action-1', name: 'Credenciamento' },
      quantity: 3,
      codes: ['AAAA-AAAA', 'BBBB-BBBB', 'CCCC-CCCC'],
    });
    expect(prisma.action.findUnique).toHaveBeenCalledWith({
      where: { id: 'action-1' },
      select: { id: true, name: true, type: true },
    });
    expect(prisma.claimCode.createManyAndReturn).toHaveBeenCalledWith({
      data: [
        { actionId: 'action-1', code: 'CCCC-CCCC', isActive: true },
        { actionId: 'action-1', code: 'AAAA-AAAA', isActive: true },
        { actionId: 'action-1', code: 'BBBB-BBBB', isActive: true },
      ],
      skipDuplicates: true,
      select: { code: true },
    });
  });

  it('creates a batch inside a transaction', async () => {
    const { repository, prisma } = createRepository();
    prisma.action.findUnique.mockResolvedValue({
      id: 'action-1',
      name: 'Credenciamento',
    });
    jest.spyOn(eventCode, 'generateClaimCode').mockReturnValue('AAAA-AAAA');
    prisma.claimCode.createManyAndReturn.mockResolvedValue([
      { code: 'AAAA-AAAA' },
    ]);

    await generateBatch(repository, 'action-1', 1);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('accepts an inactive action without selecting or filtering isActive', async () => {
    const { repository, prisma } = createRepository();
    prisma.action.findUnique.mockResolvedValue({
      id: 'inactive-action',
      name: 'Atividade encerrada',
    });
    jest.spyOn(eventCode, 'generateClaimCode').mockReturnValue('AAAA-AAAA');
    prisma.claimCode.createManyAndReturn.mockResolvedValue([
      { code: 'AAAA-AAAA' },
    ]);

    await expect(
      generateBatch(repository, 'inactive-action', 1),
    ).resolves.toEqual({
      action: { id: 'inactive-action', name: 'Atividade encerrada' },
      quantity: 1,
      codes: ['AAAA-AAAA'],
    });
    expect(prisma.action.findUnique).toHaveBeenCalledWith({
      where: { id: 'inactive-action' },
      select: { id: true, name: true, type: true },
    });
  });

  it('retries only the remaining quantity after partial collisions', async () => {
    const { repository, prisma } = createRepository();
    prisma.action.findUnique.mockResolvedValue({
      id: 'action-1',
      name: 'Credenciamento',
    });
    jest
      .spyOn(eventCode, 'generateClaimCode')
      .mockReturnValueOnce('AAAA-AAAA')
      .mockReturnValueOnce('BBBB-BBBB')
      .mockReturnValueOnce('CCCC-CCCC')
      .mockReturnValueOnce('DDDD-DDDD')
      .mockReturnValueOnce('EEEE-EEEE');
    prisma.claimCode.createManyAndReturn
      .mockResolvedValueOnce([{ code: 'AAAA-AAAA' }])
      .mockResolvedValueOnce([{ code: 'DDDD-DDDD' }, { code: 'EEEE-EEEE' }]);

    const result = await generateBatch(repository, 'action-1', 3);

    expect(result.quantity).toBe(3);
    expect(result.codes).toEqual(['AAAA-AAAA', 'DDDD-DDDD', 'EEEE-EEEE']);
    expect(prisma.claimCode.createManyAndReturn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: [
          { actionId: 'action-1', code: 'DDDD-DDDD', isActive: true },
          { actionId: 'action-1', code: 'EEEE-EEEE', isActive: true },
        ],
      }),
    );
  });

  it('fails after five rounds when collisions prevent completion', async () => {
    const { repository, prisma } = createRepository();
    prisma.action.findUnique.mockResolvedValue({
      id: 'action-1',
      name: 'Credenciamento',
    });
    jest.spyOn(eventCode, 'generateClaimCode').mockReturnValue('AAAA-AAAA');
    prisma.claimCode.createManyAndReturn.mockResolvedValue([]);

    await expect(generateBatch(repository, 'action-1', 1)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(prisma.claimCode.createManyAndReturn).toHaveBeenCalledTimes(5);
  });

  it('rolls back partial inserts when retries cannot complete the batch', async () => {
    const { repository, prisma } = createRepository();
    const attemptedCodes: string[] = [];
    const committedCodes: string[] = [];
    let insertCalls = 0;
    const tx = {
      action: prisma.action,
      claimCode: {
        createManyAndReturn: jest.fn(
          (args: {
            data: Array<{ code: string; actionId: string; isActive: boolean }>;
          }) => {
            insertCalls += 1;
            const codes = args.data.map(({ code }) => code);
            attemptedCodes.push(...codes);
            return Promise.resolve(
              insertCalls === 1 ? codes.map((code) => ({ code })) : [],
            );
          },
        ),
      },
    };

    prisma.action.findUnique.mockResolvedValue({
      id: 'action-1',
      name: 'Credenciamento',
    });
    jest.spyOn(eventCode, 'generateClaimCode').mockReturnValue('AAAA-AAAA');
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx).then((result) => {
          committedCodes.push(...attemptedCodes);
          return result;
        }),
    );

    await expect(generateBatch(repository, 'action-1', 2)).rejects.toThrow(
      ServiceUnavailableException,
    );

    expect(attemptedCodes).toHaveLength(5);
    expect(committedCodes).toEqual([]);
  });

  it('terminates with 503 when a repetitive generator cannot fill multiple candidates', async () => {
    const { repository, prisma } = createRepository();
    prisma.action.findUnique.mockResolvedValue({
      id: 'action-1',
      name: 'Credenciamento',
    });
    let generationAttempts = 0;
    jest.spyOn(eventCode, 'generateClaimCode').mockImplementation(() => {
      generationAttempts += 1;
      if (generationAttempts > 100) {
        throw new Error('unbounded candidate generation');
      }
      return 'AAAA-AAAA';
    });
    prisma.claimCode.createManyAndReturn.mockResolvedValue([]);

    await expect(generateBatch(repository, 'action-1', 2)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(prisma.claimCode.createManyAndReturn).toHaveBeenCalledTimes(5);
    expect(generationAttempts).toBeLessThanOrEqual(100);
  });
});
