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
import { ActionsService } from './actions.service';

const activeAction = {
  id: 'action-1',
  name: 'Check-in',
  description: null,
  type: ActionType.CHECKIN,
  code: null,
  points: 10,
  isActive: true,
  createdAt: new Date('2026-05-17T12:00:00.000Z'),
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

function createService() {
  const action = {
    create: jest.fn(),
    findUnique: jest.fn(),
  };

  const tx = {
    action: {
      findUnique: jest.fn(),
    },
    pointEvent: {
      create: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
  };

  const prisma = {
    action,
    $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) =>
      callback(tx),
    ),
  };

  return {
    service: new ActionsService(prisma as never),
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

describe('ActionsService', () => {
  describe('create', () => {
    it('normalizes reusable action codes before creating the action', async () => {
      const { service, prisma } = createService();
      prisma.action.create.mockResolvedValue({
        ...activeAction,
        code: 'DIA1',
      });

      await service.create({
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
        },
        select: {
          id: true,
          name: true,
          description: true,
          type: true,
          code: true,
          points: true,
          isActive: true,
          createdAt: true,
        },
      });
    });

    it('stores empty reusable action codes as undefined', async () => {
      const { service, prisma } = createService();
      prisma.action.create.mockResolvedValue(activeAction);

      await service.create({
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
          }) as object,
        }),
      );
    });

    it('maps duplicate action code constraint errors to ConflictException', async () => {
      const { service, prisma } = createService();
      prisma.action.create.mockRejectedValue(
        createUniqueConstraintError(['code']),
      );

      await expect(
        service.create({
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

  describe('redeem', () => {
    it('throws NotFoundException when the action does not exist', async () => {
      const { service, tx } = createService();
      tx.action.findUnique.mockResolvedValue(null);

      await expect(service.redeem('missing-action', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when the action is inactive', async () => {
      const { service, tx } = createService();
      tx.action.findUnique.mockResolvedValue({
        ...activeAction,
        isActive: false,
      });

      await expect(service.redeem('action-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('creates the point event before incrementing user progress', async () => {
      const { service, tx } = createService();
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

      const result = await service.redeem('action-1', 'user-1');

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
      const { service, tx } = createService();
      tx.action.findUnique.mockResolvedValue(activeAction);
      tx.pointEvent.create.mockRejectedValue(createUniqueConstraintError());

      await expect(service.redeem('action-1', 'user-1')).rejects.toThrow(
        ConflictException,
      );
      expect(tx.user.update).not.toHaveBeenCalled();
    });
  });

  describe('redeemByCode', () => {
    it('throws NotFoundException when no action has the given code', async () => {
      const { service, prisma } = createService();
      prisma.action.findUnique.mockResolvedValue(null);

      await expect(service.redeemByCode('missing', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.action.findUnique).toHaveBeenCalledWith({
        where: { code: 'MISSING' },
        select: { id: true },
      });
    });

    it('normalizes the code and reuses the action redeem flow', async () => {
      const { service, prisma, tx } = createService();
      prisma.action.findUnique.mockResolvedValue({ id: 'action-1' });
      tx.action.findUnique.mockResolvedValue(activeAction);
      tx.pointEvent.create.mockResolvedValue(undefined);
      tx.user.update.mockResolvedValue({
        id: 'user-1',
        points: 110,
        xp: 210,
        level: 1,
      });

      const result = await service.redeemByCode(' dia1 ', 'user-1');

      expect(prisma.action.findUnique).toHaveBeenCalledWith({
        where: { code: 'DIA1' },
        select: { id: true },
      });
      expect(tx.pointEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actionId: 'action-1',
            userId: 'user-1',
          }) as object,
        }),
      );
      expect(result).toMatchObject({
        action: activeAction,
        awardedPoints: 10,
        currentPoints: 110,
        currentXp: 210,
      });
    });
  });
});
