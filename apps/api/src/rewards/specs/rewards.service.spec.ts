/* eslint-disable @typescript-eslint/unbound-method */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RewardsRepository } from '../rewards.repository';
import { RewardsService } from '../rewards.service';
import { AuditService } from '../../audit/audit.service';
import {
  AuditActorType,
  AuditEntityType,
  AuditOperation,
} from '../../audit/audit.repository';

describe(RewardsService.name, () => {
  let service: RewardsService;
  let repository: jest.Mocked<RewardsRepository>;
  let audit: jest.Mocked<AuditService>;

  beforeEach(async () => {
    const repositoryMock = {
      withTransaction: jest.fn(),
      findRedemptionPage: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
    };
    const module = await Test.createTestingModule({
      providers: [
        RewardsService,
        { provide: RewardsRepository, useValue: repositoryMock },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    service = module.get(RewardsService);
    repository = module.get(RewardsRepository);
    audit = module.get(AuditService);
  });

  it('decides insufficient balance from a conditional debit count', async () => {
    const transactional = {
      findRewardById: jest.fn().mockResolvedValue({
        id: 'reward-1',
        name: 'Camiseta',
        isActive: true,
        stock: 1,
        costInPoints: 50,
      }),
      debitUserPoints: jest.fn().mockResolvedValue({ count: 0 }),
    } as unknown as RewardsRepository;
    repository.withTransaction.mockImplementation((callback) =>
      callback(transactional),
    );
    await expect(service.redeem('reward-1', 'user-1')).rejects.toEqual(
      new BadRequestException(
        'Você não tem points suficientes para resgatar esta recompensa.',
      ),
    );
  });

  it('decides concurrent status loss from the conditional transition count', async () => {
    const transactional = {
      lockRedemptionState: jest.fn().mockResolvedValue({ status: 'PENDING' }),
      transitionRedemption: jest.fn().mockResolvedValue({ count: 0 }),
    } as unknown as RewardsRepository;
    repository.withTransaction.mockImplementation((callback) =>
      callback(transactional),
    );
    await expect(
      service.deliverRedemption(
        'redemption-1',
        { reason: 'Entrega confirmada pela coordenação' },
        { actorAdminId: 'admin-1', requestId: 'request-1' },
      ),
    ).rejects.toEqual(
      new ConflictException('Apenas resgates pendentes podem mudar de status.'),
    );
  });

  it('normalizes reward filters the same way as the export query', async () => {
    await service.findRedemptions({
      page: 1,
      limit: 20,
      rewardId: ' reward-1 ',
      search: ' Ada ',
      status: 'all',
    } as never);

    expect(repository.findRedemptionPage).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      rewardId: 'reward-1',
      search: 'Ada',
      status: undefined,
    });
  });

  it('does not write or audit an effective no-op update', async () => {
    const current = {
      id: 'reward-1',
      name: 'Camiseta',
      description: null,
      costInPoints: 50,
      stock: 2,
      isActive: true,
      imageUrl: null,
    };
    const transactional = {
      lockRewardState: jest.fn().mockResolvedValue(current),
      updateReward: jest.fn(),
      auditWriter: {},
    } as unknown as RewardsRepository;
    repository.withTransaction.mockImplementation((callback) =>
      callback(transactional, {} as never),
    );

    await expect(
      service.update(
        'reward-1',
        { reason: 'Conferencia sem alteracao administrativa', stock: 2 },
        { actorAdminId: 'admin-1', requestId: 'request-1' },
      ),
    ).resolves.toBe(current);
    expect(transactional.updateReward).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('serializes equivalent updates into one effect and one coherent audit', async () => {
    const original = {
      id: 'reward-concurrent',
      name: 'Camiseta',
      description: null,
      costInPoints: 50,
      stock: 2,
      isActive: true,
      imageUrl: null,
      createdAt: new Date('2026-07-14T10:00:00.000Z'),
      updatedAt: new Date('2026-07-14T10:00:00.000Z'),
    };
    let state = { ...original };
    let previous = Promise.resolve();
    const writes: Array<{ isActive?: boolean }> = [];

    repository.withTransaction.mockImplementation(async (callback) => {
      const waitForPrevious = previous;
      let release!: () => void;
      previous = new Promise<void>((resolve) => {
        release = resolve;
      });
      await waitForPrevious;
      const transactional = {
        auditWriter: {},
        lockRewardState: jest.fn(() => Promise.resolve({ ...state })),
        updateReward: jest.fn((_id: string, input: { isActive?: boolean }) => {
          writes.push(input);
          state = { ...state, ...input };
          return Promise.resolve({ ...state });
        }),
      };
      try {
        return await callback(transactional as never, {} as never);
      } finally {
        release();
      }
    });

    const results = await Promise.all([
      service.update(
        original.id,
        { isActive: false, reason: 'Desativacao concorrente equivalente A' },
        { actorAdminId: 'admin-1', requestId: 'request-a' },
      ),
      service.update(
        original.id,
        { isActive: false, reason: 'Desativacao concorrente equivalente B' },
        { actorAdminId: 'admin-1', requestId: 'request-b' },
      ),
    ]);

    expect(results).toEqual([
      expect.objectContaining({ isActive: false }),
      expect.objectContaining({ isActive: false }),
    ]);
    expect(writes).toEqual([{ isActive: false }]);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), {
      actor: {
        actorType: AuditActorType.ADMIN,
        actorAdminId: 'admin-1',
        requestId: 'request-a',
      },
      operation: AuditOperation.REWARD_STATUS_CHANGED,
      entityType: AuditEntityType.REWARD,
      entityId: original.id,
      reason: 'Desativacao concorrente equivalente A',
      before: { isActive: true },
      after: { isActive: false },
    });
  });

  it('audits a created reward with only allowlisted snapshot fields', async () => {
    const created = {
      id: 'reward-1',
      name: 'Camiseta',
      description: null,
      costInPoints: 50,
      stock: 2,
      isActive: true,
      imageUrl: 'https://example.test/private-storage-key',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const transactional = {
      createReward: jest.fn().mockResolvedValue(created),
      auditWriter: { create: jest.fn() },
    } as unknown as RewardsRepository;
    repository.withTransaction.mockImplementation((callback) =>
      callback(transactional, {} as never),
    );

    await service.create(
      {
        reason: 'Inclusao aprovada pela coordenação administrativa',
        name: 'Camiseta',
        costInPoints: 50,
        stock: 2,
      },
      { actorAdminId: 'admin-1', requestId: 'request-1' },
    );

    expect(audit.record).toHaveBeenCalledWith(transactional.auditWriter, {
      actor: {
        actorType: AuditActorType.ADMIN,
        actorAdminId: 'admin-1',
        requestId: 'request-1',
      },
      operation: AuditOperation.REWARD_CREATED,
      entityType: AuditEntityType.REWARD,
      entityId: 'reward-1',
      reason: 'Inclusao aprovada pela coordenação administrativa',
      before: null,
      after: {
        id: 'reward-1',
        name: 'Camiseta',
        description: null,
        costInPoints: 50,
        stock: 2,
        isActive: true,
      },
    });
    expect(audit.record.mock.calls[0]?.[1].after).not.toHaveProperty(
      'imageUrl',
    );
  });

  it('rolls back reward creation and its provisional audit when the writer fails', async () => {
    const failure = new Error('audit writer failed after reward creation');
    const committed = {
      rewards: [] as Array<{ id: string; name: string }>,
      audits: [] as string[],
    };

    repository.withTransaction.mockImplementation(async (callback) => {
      const provisional = structuredClone(committed);
      const transactional = {
        createReward: jest.fn((input: { name: string }) => {
          const created = {
            id: 'reward-create-rollback',
            description: null,
            costInPoints: 50,
            stock: 2,
            isActive: true,
            imageUrl: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...input,
          };
          provisional.rewards.push({ id: created.id, name: created.name });
          return Promise.resolve(created);
        }),
        auditWriter: {
          create: jest.fn(() => {
            provisional.audits.push('provisional-audit');
            return Promise.resolve({ id: 'audit-1' });
          }),
        },
      };
      const result = await callback(transactional as never, {} as never);
      committed.rewards = provisional.rewards;
      committed.audits = provisional.audits;
      return result;
    });
    audit.record.mockImplementation(async (writer) => {
      await writer.create({} as never);
      throw failure;
    });

    await expect(
      service.create(
        {
          name: 'Camiseta',
          costInPoints: 50,
          stock: 2,
          reason: 'Criacao administrativa confirmada',
        },
        { actorAdminId: 'admin-1', requestId: 'request-1' },
      ),
    ).rejects.toBe(failure);
    expect(committed).toEqual({ rewards: [], audits: [] });
  });

  it.each([
    [
      'reward update',
      { name: 'Camiseta revisada' },
      AuditOperation.REWARD_UPDATED,
    ],
    [
      'reward status change',
      { isActive: false },
      AuditOperation.REWARD_STATUS_CHANGED,
    ],
  ])(
    'rolls back %s and its provisional audit when the writer fails',
    async (_label, change, expectedOperation) => {
      const failure = new Error('audit writer failed after first write');
      const original = {
        id: 'reward-rollback',
        name: 'Camiseta',
        description: null,
        costInPoints: 50,
        stock: 2,
        isActive: true,
        imageUrl: null,
        createdAt: new Date('2026-07-14T10:00:00.000Z'),
        updatedAt: new Date('2026-07-14T10:00:00.000Z'),
      };
      const committed = { reward: { ...original }, audits: [] as string[] };

      repository.withTransaction.mockImplementation(async (callback) => {
        const provisional = {
          reward: { ...committed.reward },
          audits: [...committed.audits],
        };
        const transactional = {
          auditWriter: {
            create: jest.fn(() => {
              provisional.audits.push('provisional-audit');
              return Promise.resolve({ id: 'audit-1' });
            }),
          },
          lockRewardState: jest.fn(() =>
            Promise.resolve({ ...provisional.reward }),
          ),
          updateReward: jest.fn((_id: string, input: typeof change) => {
            provisional.reward = { ...provisional.reward, ...input };
            return Promise.resolve({ ...provisional.reward });
          }),
        };
        const result = await callback(transactional as never, {} as never);
        committed.reward = provisional.reward;
        committed.audits = provisional.audits;
        return result;
      });
      audit.record.mockImplementation(async (writer) => {
        await writer.create({} as never);
        throw failure;
      });

      await expect(
        service.update(
          original.id,
          { ...change, reason: 'Alteracao administrativa confirmada' },
          { actorAdminId: 'admin-1', requestId: 'request-1' },
        ),
      ).rejects.toBe(failure);

      expect(committed).toEqual({ reward: original, audits: [] });
      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          actor: {
            actorType: AuditActorType.ADMIN,
            actorAdminId: 'admin-1',
            requestId: 'request-1',
          },
          operation: expectedOperation,
          entityType: AuditEntityType.REWARD,
          entityId: original.id,
          reason: 'Alteracao administrativa confirmada',
        }),
      );
      expect(audit.record.mock.calls[0]?.[1]).not.toHaveProperty(
        'participantId',
      );
    },
  );

  it('rolls back delivery and its provisional audit when the writer fails', async () => {
    const failure = new Error('audit writer failed after first write');
    const original = {
      id: 'redemption-deliver-rollback',
      userId: 'user-1',
      rewardId: 'reward-1',
      pointsSpent: 50,
      status: 'PENDING' as const,
      deliveredAt: null,
      deliveredByAdminId: null,
      cancelledAt: null,
      cancelledByAdminId: null,
      pointEvents: [],
      user: {
        id: 'user-1',
        name: 'Ada',
        email: 'ada@example.test',
        points: 50,
      },
      reward: { id: 'reward-1', name: 'Camiseta', stock: 1 },
    };
    const committed = { redemption: { ...original }, audits: [] as string[] };

    repository.withTransaction.mockImplementation(async (callback) => {
      const provisional = {
        redemption: { ...committed.redemption },
        audits: [...committed.audits],
      };
      const transactional = {
        auditWriter: {
          create: jest.fn(() => {
            provisional.audits.push('provisional-audit');
            return Promise.resolve({ id: 'audit-1' });
          }),
        },
        lockRedemptionState: jest.fn(() =>
          Promise.resolve({ ...provisional.redemption }),
        ),
        transitionRedemption: jest.fn(
          (_id: string, status: 'DELIVERED', adminId: string, at: Date) => {
            provisional.redemption = {
              ...provisional.redemption,
              status,
              deliveredAt: at,
              deliveredByAdminId: adminId,
            };
            return Promise.resolve({ count: 1 });
          },
        ),
        findRedemptionById: jest.fn(() =>
          Promise.resolve({ ...provisional.redemption }),
        ),
      };
      const result = await callback(transactional as never, {} as never);
      committed.redemption = provisional.redemption;
      committed.audits = provisional.audits;
      return result;
    });
    audit.record.mockImplementation(async (writer) => {
      await writer.create({} as never);
      throw failure;
    });

    await expect(
      service.deliverRedemption(
        original.id,
        { reason: 'Entrega presencial confirmada pela coordenacao' },
        { actorAdminId: 'admin-1', requestId: 'request-1' },
      ),
    ).rejects.toBe(failure);
    expect(committed).toEqual({ redemption: original, audits: [] });
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actor: {
          actorType: AuditActorType.ADMIN,
          actorAdminId: 'admin-1',
          requestId: 'request-1',
        },
        operation: AuditOperation.REWARD_REDEMPTION_DELIVERED,
        entityType: AuditEntityType.REWARD_REDEMPTION,
        entityId: original.id,
        participantId: original.userId,
        reason: 'Entrega presencial confirmada pela coordenacao',
        before: {
          id: original.id,
          status: 'PENDING',
          deliveredAt: null,
          deliveredByAdminId: null,
        },
      }),
    );
  });

  it('rolls back cancellation balances, stock, refund and audit when the writer fails', async () => {
    const failure = new Error('audit writer failed after first write');
    const original = {
      redemption: {
        id: 'redemption-cancel-rollback',
        userId: 'user-1',
        rewardId: 'reward-1',
        pointsSpent: 50,
        status: 'PENDING' as const,
        deliveredAt: null,
        deliveredByAdminId: null,
        cancelledAt: null,
        cancelledByAdminId: null,
      },
      user: { id: 'user-1', points: 50 },
      reward: { id: 'reward-1', name: 'Camiseta', stock: 1 },
      pointEvents: [{ id: 'debit-1', points: -50 }],
      audits: [] as string[],
    };
    const committed = structuredClone(original);

    repository.withTransaction.mockImplementation(async (callback) => {
      const provisional = structuredClone(committed);
      const transactional = {
        auditWriter: {
          create: jest.fn(() => {
            provisional.audits.push('provisional-audit');
            return Promise.resolve({ id: 'audit-1' });
          }),
        },
        lockCancellationState: jest.fn(() =>
          Promise.resolve({
            ...provisional.redemption,
            user: { ...provisional.user },
            reward: { ...provisional.reward },
          }),
        ),
        transitionRedemption: jest.fn(
          (_id: string, status: 'CANCELLED', adminId: string, at: Date) => {
            provisional.redemption.status = status;
            provisional.redemption.cancelledAt = at;
            provisional.redemption.cancelledByAdminId = adminId;
            return Promise.resolve({ count: 1 });
          },
        ),
        creditUserPoints: jest.fn((_id: string, points: number) => {
          provisional.user.points += points;
          return Promise.resolve({ ...provisional.user });
        }),
        incrementRewardStock: jest.fn(() => {
          provisional.reward.stock += 1;
          return Promise.resolve({ ...provisional.reward });
        }),
        createRewardPointEvent: jest.fn((input: { points: number }) => {
          const refund = { id: 'refund-1', points: input.points };
          provisional.pointEvents.push(refund);
          return Promise.resolve(refund);
        }),
        findRedemptionById: jest.fn(() =>
          Promise.resolve({
            ...provisional.redemption,
            user: { ...provisional.user },
            reward: { ...provisional.reward },
            pointEvents: [...provisional.pointEvents],
          }),
        ),
      };
      const result = await callback(transactional as never, {} as never);
      Object.assign(committed, provisional);
      return result;
    });
    audit.record.mockImplementation(async (writer) => {
      await writer.create({} as never);
      throw failure;
    });

    await expect(
      service.cancelRedemption(
        original.redemption.id,
        { reason: 'Cancelamento operacional confirmado pela coordenacao' },
        { actorAdminId: 'admin-1', requestId: 'request-1' },
      ),
    ).rejects.toBe(failure);

    expect(committed).toEqual(original);
    expect(committed.pointEvents).toEqual([{ id: 'debit-1', points: -50 }]);
    expect(committed.audits).toEqual([]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actor: {
          actorType: AuditActorType.ADMIN,
          actorAdminId: 'admin-1',
          requestId: 'request-1',
        },
        operation: AuditOperation.REWARD_REDEMPTION_CANCELLED,
        entityType: AuditEntityType.REWARD_REDEMPTION,
        entityId: original.redemption.id,
        participantId: original.redemption.userId,
        reason: 'Cancelamento operacional confirmado pela coordenacao',
        before: {
          id: original.redemption.id,
          status: 'PENDING',
          stock: 1,
          points: 50,
        },
      }),
    );
  });
});
