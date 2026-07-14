import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  ActionType,
  PointEventKind,
  PointEventSource,
  Prisma,
} from '@prisma/client';
import { ActionsRepository } from '../actions.repository';
import { ActionsService } from '../actions.service';

const activeAction = {
  id: 'action-1',
  name: 'Check-in',
  description: null,
  type: ActionType.CHECKIN,
  code: null,
  points: 10,
  isActive: true,
  isCodeActive: false,
  createdAt: new Date('2026-05-17T12:00:00.000Z'),
};

const actionSummarySelect = {
  id: true,
  name: true,
  description: true,
  type: true,
  code: true,
  points: true,
  isActive: true,
  isCodeActive: true,
  createdAt: true,
};

type PointEventCreateArgs = {
  data: {
    userId: string;
    actionId: string;
    points: number;
    kind: PointEventKind;
    source: PointEventSource;
    description: string;
    createdAt: Date;
  };
};

function createRepository() {
  const action = {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  };

  const tx = {
    action: {
      findUnique: jest.fn(),
    },
    claimCode: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    pointEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
  };

  const prisma = {
    action,
    claimCode: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      groupBy: jest.fn(),
    },
    pointEvent: {
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    ),
  };

  const persistenceRepository = new ActionsRepository(prisma as never);
  return {
    repository: new ActionsService(persistenceRepository),
    prisma,
    tx,
  };
}

function createUniqueConstraintError(target = ['userId', 'actionId']) {
  return new Prisma.PrismaClientKnownRequestError(
    `Unique constraint failed on the fields: (${target.join(',')})`,
    {
      code: 'P2002',
      clientVersion: '7.8.0',
      meta: {
        target,
      },
    },
  );
}

describe('ActionsRepository', () => {
  describe('create', () => {
    it('normalizes reusable action codes before creating the action', async () => {
      const { repository, prisma } = createRepository();
      prisma.action.create.mockResolvedValue({
        ...activeAction,
        code: 'DIA1',
      });

      await repository.create({
        name: 'Check-in Dia 1',
        description: undefined,
        type: ActionType.CHECKIN,
        points: 10,
        code: 'dia1',
        isActive: true,
      });

      expect(prisma.action.create).toHaveBeenCalledWith({
        data: {
          name: 'Check-in Dia 1',
          description: undefined,
          type: ActionType.CHECKIN,
          points: 10,
          code: 'DIA1',
          isActive: true,
          isCodeActive: true,
        },
        select: {
          id: true,
          name: true,
          description: true,
          type: true,
          code: true,
          points: true,
          isActive: true,
          isCodeActive: true,
          createdAt: true,
        },
      });
    });

    it('stores empty reusable action codes as undefined', async () => {
      const { repository, prisma } = createRepository();
      prisma.action.create.mockResolvedValue(activeAction);

      await repository.create({
        name: 'Check-in Dia 1',
        description: undefined,
        type: ActionType.CHECKIN,
        points: 10,
        code: '',
        isActive: true,
      });

      expect(prisma.action.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            code: undefined,
            isCodeActive: false,
          }) as object,
        }),
      );
    });

    it('rejects the namespace reserved for single-use codes', async () => {
      const { repository, prisma } = createRepository();

      await expect(
        repository.create({
          name: 'Check-in Dia 1',
          description: undefined,
          type: ActionType.CHECKIN,
          points: 10,
          code: ' abcd-efgh ',
          isActive: true,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Este formato é reservado para códigos de uso único.',
        ),
      );
      expect(prisma.action.create).not.toHaveBeenCalled();
    });

    it('maps duplicate action code constraint errors to ConflictException', async () => {
      const { repository, prisma } = createRepository();
      prisma.action.create.mockRejectedValue(
        createUniqueConstraintError(['code']),
      );

      await expect(
        repository.create({
          name: 'Check-in Dia 1',
          description: undefined,
          type: ActionType.CHECKIN,
          points: 10,
          code: 'DIA1',
          isActive: true,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('preserves an active reusable code state when replacing its code', async () => {
      const { repository, prisma } = createRepository();
      prisma.action.findUnique.mockResolvedValue({
        id: 'action-1',
        code: 'OLD',
        isCodeActive: true,
      });
      prisma.action.update.mockResolvedValue({ ...activeAction, code: 'NEW' });

      await repository.update('action-1', { name: 'Novo nome', code: ' new ' });

      expect(prisma.action.update).toHaveBeenCalledWith({
        where: { id: 'action-1' },
        data: { name: 'Novo nome', code: 'NEW', isCodeActive: true },
        select: actionSummarySelect,
      });
    });

    it('preserves a disabled reusable code state when replacing its code', async () => {
      const { repository, prisma } = createRepository();
      prisma.action.findUnique.mockResolvedValue({
        id: 'action-1',
        code: 'OLD',
        isCodeActive: false,
      });
      prisma.action.update.mockResolvedValue({ ...activeAction, code: 'NEW' });

      await repository.update('action-1', { code: ' new ' });

      expect(prisma.action.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { code: 'NEW', isCodeActive: false },
        }),
      );
    });

    it('activates a newly assigned code unless an explicit flag overrides it', async () => {
      const { repository, prisma } = createRepository();
      prisma.action.findUnique.mockResolvedValue({
        id: 'action-1',
        code: null,
        isCodeActive: false,
      });
      prisma.action.update.mockResolvedValue({ ...activeAction, code: 'NEW' });

      await repository.update('action-1', { code: 'NEW' });
      expect(prisma.action.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: { code: 'NEW', isCodeActive: true },
        }),
      );

      await repository.update('action-1', {
        code: 'NEW',
        isCodeActive: false,
      });
      expect(prisma.action.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: { code: 'NEW', isCodeActive: false },
        }),
      );
    });

    it('removes a code with null and deactivates code redemption', async () => {
      const { repository, prisma } = createRepository();
      prisma.action.findUnique.mockResolvedValue({
        id: 'action-1',
        code: 'OLD',
      });
      prisma.action.update.mockResolvedValue({ ...activeAction, code: null });
      await repository.update('action-1', { code: null });
      expect(prisma.action.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { code: null, isCodeActive: false } }),
      );
    });

    it('forces isCodeActive false when an action has no code', async () => {
      const { repository, prisma } = createRepository();
      prisma.action.findUnique.mockResolvedValue({
        id: 'action-1',
        code: null,
      });
      prisma.action.update.mockResolvedValue(activeAction);
      await repository.update('action-1', { isCodeActive: true });
      expect(prisma.action.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isCodeActive: false } }),
      );
    });

    it('rejects claim-code-shaped replacements', async () => {
      const { repository, prisma } = createRepository();
      prisma.action.findUnique.mockResolvedValue({
        id: 'action-1',
        code: 'OLD',
      });
      await expect(
        repository.update('action-1', { code: 'abcd-efgh' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.action.update).not.toHaveBeenCalled();
    });

    it('maps duplicate replacement codes to conflict', async () => {
      const { repository, prisma } = createRepository();
      prisma.action.findUnique.mockResolvedValue({
        id: 'action-1',
        code: 'OLD',
      });
      prisma.action.update.mockRejectedValue(
        createUniqueConstraintError(['code']),
      );
      await expect(
        repository.update('action-1', { code: 'NEW' }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws 404 without attempting an update', async () => {
      const { repository, prisma } = createRepository();
      prisma.action.findUnique.mockResolvedValue(null);
      await expect(
        repository.update('missing', { points: 50 }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.action.update).not.toHaveBeenCalled();
    });
  });

  describe('admin queries', () => {
    it('paginates and filters actions while loading counters without N+1', async () => {
      const { repository, prisma } = createRepository();
      prisma.action.count.mockResolvedValue(1);
      prisma.action.findMany.mockResolvedValue([activeAction]);
      prisma.claimCode.groupBy.mockResolvedValue([
        { actionId: 'action-1', _count: { _all: 3 } },
      ]);
      prisma.pointEvent.groupBy.mockResolvedValue([
        { actionId: 'action-1', _count: { _all: 2 } },
      ]);

      const result = await repository.findAdminActions({
        page: 2,
        limit: 10,
        search: ' check ',
        status: 'active' as never,
        type: ActionType.CHECKIN,
      });

      expect(prisma.action.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isActive: true,
            type: ActionType.CHECKIN,
            OR: [
              { name: { contains: 'check', mode: 'insensitive' } },
              { description: { contains: 'check', mode: 'insensitive' } },
              { code: { contains: 'check', mode: 'insensitive' } },
            ],
          },
          skip: 10,
          take: 10,
        }),
      );
      expect(result).toEqual({
        items: [
          expect.objectContaining({
            claimCodes: { total: 3, used: 0, available: 0 },
            redemptionsCount: 2,
          }),
        ],
        meta: { page: 2, limit: 10, total: 1, totalPages: 1 },
      });
      expect(prisma.claimCode.groupBy).toHaveBeenCalledTimes(1);
      expect(prisma.pointEvent.groupBy).toHaveBeenCalledTimes(1);
    });

    it('lists reusable codes using only reusable-code action redemptions', async () => {
      const { repository, prisma } = createRepository();
      prisma.action.count.mockResolvedValue(1);
      prisma.action.findMany.mockResolvedValue([
        { ...activeAction, code: 'DIA1', isCodeActive: true },
      ]);
      prisma.pointEvent.groupBy.mockResolvedValue([
        {
          actionId: 'action-1',
          _count: { _all: 4 },
          _max: { createdAt: activeAction.createdAt },
        },
      ]);

      const result = await repository.findReusableCodes({
        page: 1,
        limit: 20,
        search: ' dia ',
      });

      expect(prisma.action.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            code: { not: null },
            OR: [
              { name: { contains: 'dia', mode: 'insensitive' } },
              { code: { contains: 'dia', mode: 'insensitive' } },
            ],
          },
        }),
      );

      expect(prisma.pointEvent.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            actionId: { in: ['action-1'] },
            source: PointEventSource.ACTION_REDEEM,
            redemptionMethod: 'REUSABLE_CODE',
          },
        }),
      );
      expect(result.items[0]).toEqual(
        expect.objectContaining({
          status: 'ACTIVE',
          totalUses: 4,
          lastUsedAt: activeAction.createdAt.toISOString(),
        }),
      );
    });

    it.each([
      [{ isActive: true, isCodeActive: true }, 'ACTIVE'],
      [{ isActive: true, isCodeActive: false }, 'DISABLED'],
      [{ isActive: false, isCodeActive: true }, 'BLOCKED_BY_ACTION'],
      [{ isActive: false, isCodeActive: false }, 'DISABLED'],
    ] as const)('maps reusable-code state %o to %s', async (state, status) => {
      const { repository, prisma } = createRepository();
      prisma.action.count.mockResolvedValue(1);
      prisma.action.findMany.mockResolvedValue([
        { ...activeAction, code: 'DIA1', ...state },
      ]);
      prisma.pointEvent.groupBy.mockResolvedValue([]);

      const result = await repository.findReusableCodes({ page: 1, limit: 20 });

      expect(result.items[0]?.status).toBe(status);
      expect(result.items[0]?.isCodeActive).toBe(state.isCodeActive);
    });

    it.each([
      ['active', { code: { not: null }, isActive: true, isCodeActive: true }],
      ['disabled', { code: { not: null }, isCodeActive: false }],
      ['blocked', { code: { not: null }, isActive: false, isCodeActive: true }],
    ] as const)(
      'uses exact %s reusable-code filter semantics',
      async (status, where) => {
        const { repository, prisma } = createRepository();
        prisma.action.count.mockResolvedValue(0);
        prisma.action.findMany.mockResolvedValue([]);

        await repository.findReusableCodes({ page: 1, limit: 20, status });

        expect(prisma.action.count).toHaveBeenCalledWith({ where });
        expect(prisma.action.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where }),
        );
      },
    );

    it('returns paginated reusable-code redemptions with participant data', async () => {
      const { repository, prisma } = createRepository();
      prisma.action.findUnique.mockResolvedValue({ id: 'action-1' });
      prisma.pointEvent.count.mockResolvedValue(1);
      prisma.pointEvent.findMany.mockResolvedValue([
        {
          id: 'event-1',
          points: 10,
          createdAt: activeAction.createdAt,
          user: {
            id: 'user-1',
            name: 'Ana',
            email: 'ana@example.com',
            cpf: '123',
          },
        },
      ]);

      const result = await repository.findReusableCodeRedemptions('action-1', {
        page: 1,
        limit: 20,
      });

      const reusableWhere = {
        actionId: 'action-1',
        source: PointEventSource.ACTION_REDEEM,
        redemptionMethod: 'REUSABLE_CODE',
      };
      expect(prisma.pointEvent.count).toHaveBeenCalledWith({
        where: reusableWhere,
      });
      expect(prisma.pointEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: reusableWhere }),
      );
      expect(result.items[0]?.participant.id).toBe('user-1');
    });
  });

  describe('redeem', () => {
    it('throws NotFoundException when the action does not exist', async () => {
      const { repository, tx } = createRepository();
      tx.action.findUnique.mockResolvedValue(null);

      await expect(
        repository.redeem('missing-action', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when the action is inactive', async () => {
      const { repository, tx } = createRepository();
      tx.action.findUnique.mockResolvedValue({
        ...activeAction,
        isActive: false,
      });

      await expect(repository.redeem('action-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('creates the point event before incrementing user progress', async () => {
      const { repository, tx } = createRepository();
      const callOrder: string[] = [];

      tx.action.findUnique.mockResolvedValue(activeAction);
      tx.pointEvent.create.mockImplementation(() => {
        callOrder.push('pointEvent.create');
      });
      tx.user.update.mockImplementation(() => {
        callOrder.push('user.update');

        return {
          id: 'user-1',
          points: 110,
          xp: 210,
          level: 1,
        };
      });

      const result = await repository.redeem('action-1', 'user-1');

      expect(callOrder).toEqual(['pointEvent.create', 'user.update']);
      const pointEventCreateMock = tx.pointEvent.create as jest.Mock<
        void,
        [PointEventCreateArgs]
      >;
      const pointEventCreateArgs = pointEventCreateMock.mock.calls[0][0];

      expect(pointEventCreateArgs).toMatchObject({
        data: {
          userId: 'user-1',
          actionId: 'action-1',
          points: 10,
          kind: 'CREDIT',
          source: 'ACTION_REDEEM',
          redemptionMethod: 'DIRECT',
          claimCodeId: undefined,
          description: 'Resgate da atividade: Check-in',
          createdAt: expect.any(Date) as Date,
        },
      });
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          points: { increment: 10 },
          xp: { increment: 10 },
        },
        select: {
          id: true,
          points: true,
          xp: true,
          level: true,
        },
      });
      expect(result).toMatchObject({
        action: activeAction,
        awardedPoints: 10,
        currentPoints: 110,
        currentXp: 210,
        currentLevel: 1,
      });
      expect(result.redeemedAt).toBeInstanceOf(Date);
    });

    it('maps duplicate action redeem constraint errors to ConflictException', async () => {
      const { repository, tx } = createRepository();
      tx.action.findUnique.mockResolvedValue(activeAction);
      tx.pointEvent.create.mockRejectedValue(createUniqueConstraintError());

      await expect(repository.redeem('action-1', 'user-1')).rejects.toThrow(
        ConflictException,
      );
      expect(tx.user.update).not.toHaveBeenCalled();
    });
  });

  describe('redeemByCode', () => {
    it('throws NotFoundException when no action has the given code', async () => {
      const { repository, prisma } = createRepository();
      prisma.action.findUnique.mockResolvedValue(null);

      await expect(
        repository.redeemByCode('missing', 'user-1'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.action.findUnique).toHaveBeenCalledWith({
        where: { code: 'MISSING' },
        select: { id: true },
      });
    });

    it('normalizes the code and reuses the action redeem flow', async () => {
      const { repository, prisma, tx } = createRepository();
      prisma.action.findUnique.mockResolvedValue({ id: 'action-1' });
      tx.action.findUnique.mockResolvedValue({
        ...activeAction,
        code: 'DIA1',
        isCodeActive: true,
      });
      tx.pointEvent.create.mockResolvedValue(undefined);
      tx.user.update.mockResolvedValue({
        id: 'user-1',
        points: 110,
        xp: 210,
        level: 1,
      });

      const result = await repository.redeemByCode(' dia1 ', 'user-1');

      expect(prisma.action.findUnique).toHaveBeenCalledWith({
        where: { code: 'DIA1' },
        select: { id: true },
      });
      expect(tx.pointEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actionId: 'action-1',
            userId: 'user-1',
            redemptionMethod: 'REUSABLE_CODE',
            claimCodeId: undefined,
          }) as object,
        }),
      );
      expect(result).toMatchObject({
        action: { ...activeAction, code: 'DIA1', isCodeActive: true },
        awardedPoints: 10,
        currentPoints: 110,
        currentXp: 210,
      });
    });

    it('resolves claim-code-shaped values exclusively through ClaimCode', async () => {
      const { repository, prisma, tx } = createRepository();
      tx.claimCode.findUnique.mockResolvedValue(null);

      await expect(
        repository.redeemByCode(' k7xm-9n2p ', 'user-1'),
      ).rejects.toThrow(
        new NotFoundException('Atividade pontuável não encontrada.'),
      );

      expect(tx.claimCode.findUnique).toHaveBeenCalledWith({
        where: { code: 'K7XM-9N2P' },
        include: { action: { select: actionSummarySelect } },
      });
      expect(prisma.action.findUnique).not.toHaveBeenCalled();
    });

    it('resolves reusable values exclusively through Action.code', async () => {
      const { repository, prisma, tx } = createRepository();
      prisma.action.findUnique.mockResolvedValue(null);

      await expect(repository.redeemByCode(' dia1 ', 'user-1')).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.action.findUnique).toHaveBeenCalledWith({
        where: { code: 'DIA1' },
        select: { id: true },
      });
      expect(tx.claimCode.findUnique).not.toHaveBeenCalled();
    });

    it('rejects an already used claim code', async () => {
      const { repository, tx } = createRepository();
      tx.claimCode.findUnique.mockResolvedValue({
        id: 'claim-1',
        isUsed: true,
        isActive: false,
        action: activeAction,
      });

      await expect(
        repository.redeemByCode('K7XM-9N2P', 'user-1'),
      ).rejects.toThrow(new ConflictException('Este código já foi utilizado.'));
      expect(tx.claimCode.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an inactive claim code without writing', async () => {
      const { repository, tx } = createRepository();
      tx.claimCode.findUnique.mockResolvedValue({
        id: 'claim-1',
        isUsed: false,
        isActive: false,
        action: activeAction,
      });

      await expect(
        repository.redeemByCode('K7XM-9N2P', 'user-1'),
      ).rejects.toThrow(new BadRequestException('Este código está inativo.'));
      expect(tx.claimCode.updateMany).not.toHaveBeenCalled();
      expect(tx.pointEvent.create).not.toHaveBeenCalled();
    });

    it('rejects an inactive action without consuming its claim code', async () => {
      const { repository, tx } = createRepository();
      tx.claimCode.findUnique.mockResolvedValue({
        id: 'claim-1',
        isUsed: false,
        isActive: true,
        action: { ...activeAction, isActive: false },
      });

      await expect(
        repository.redeemByCode('K7XM-9N2P', 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(tx.claimCode.updateMany).not.toHaveBeenCalled();
    });

    it('maps a lost claim-code compare-and-set to the used-code conflict', async () => {
      const { repository, tx } = createRepository();
      tx.claimCode.findUnique
        .mockResolvedValueOnce({
          id: 'claim-1',
          isUsed: false,
          isActive: true,
          action: activeAction,
        })
        .mockResolvedValueOnce({ isUsed: true, isActive: false });
      tx.claimCode.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        repository.redeemByCode('K7XM-9N2P', 'user-1'),
      ).rejects.toThrow(new ConflictException('Este código já foi utilizado.'));
      expect(tx.claimCode.updateMany).toHaveBeenCalledWith({
        where: { id: 'claim-1', isUsed: false, isActive: true },
        data: {
          isUsed: true,
          isActive: false,
          usedById: 'user-1',
          usedAt: expect.any(Date) as Date,
        },
      });
      expect(tx.pointEvent.create).not.toHaveBeenCalled();
    });

    it('maps a lost compare-and-set caused by deactivation to bad request', async () => {
      const { repository, tx } = createRepository();
      tx.claimCode.findUnique
        .mockResolvedValueOnce({
          id: 'claim-1',
          isUsed: false,
          isActive: true,
          action: activeAction,
        })
        .mockResolvedValueOnce({ isUsed: false, isActive: false });
      tx.claimCode.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        repository.redeemByCode('K7XM-9N2P', 'user-1'),
      ).rejects.toThrow(new BadRequestException('Este código está inativo.'));
      expect(tx.pointEvent.create).not.toHaveBeenCalled();
      expect(tx.user.update).not.toHaveBeenCalled();
    });

    it('atomically consumes a claim code and grants its action', async () => {
      const { repository, prisma, tx } = createRepository();
      const callOrder: string[] = [];
      tx.claimCode.findUnique.mockResolvedValue({
        id: 'claim-1',
        isUsed: false,
        isActive: true,
        action: activeAction,
      });
      tx.claimCode.updateMany.mockImplementation(() => {
        callOrder.push('claimCode.updateMany');
        return { count: 1 };
      });
      tx.pointEvent.create.mockImplementation(() => {
        callOrder.push('pointEvent.create');
      });
      tx.user.update.mockImplementation(() => {
        callOrder.push('user.update');
        return { id: 'user-1', points: 110, xp: 210, level: 2 };
      });

      const result = await repository.redeemByCode('K7XM-9N2P', 'user-1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual([
        'claimCode.updateMany',
        'pointEvent.create',
        'user.update',
      ]);
      expect(tx.pointEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            redemptionMethod: 'CLAIM_CODE',
            claimCodeId: 'claim-1',
          }) as object,
        }),
      );
      expect(result).toMatchObject({
        action: activeAction,
        awardedPoints: 10,
        currentPoints: 110,
        currentXp: 210,
        currentLevel: 2,
      });
    });

    it('maps PointEvent P2002 separately and performs no writes outside the transaction', async () => {
      const { repository, prisma, tx } = createRepository();
      tx.claimCode.findUnique.mockResolvedValue({
        id: 'claim-1',
        isUsed: false,
        isActive: true,
        action: activeAction,
      });
      tx.claimCode.updateMany.mockResolvedValue({ count: 1 });
      tx.pointEvent.create.mockRejectedValue(createUniqueConstraintError());

      await expect(
        repository.redeemByCode('K7XM-9N2P', 'user-1'),
      ).rejects.toThrow(
        new ConflictException('Você já resgatou esta atividade.'),
      );

      expect(tx.claimCode.updateMany).toHaveBeenCalledTimes(1);
      expect(tx.user.update).not.toHaveBeenCalled();
      expect(prisma.claimCode.updateMany).not.toHaveBeenCalled();
    });
  });
});
