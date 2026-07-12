import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  PointEventKind,
  PointEventSource,
  RedemptionStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminParticipantsService } from './admin-participants.service';

describe(AdminParticipantsService.name, () => {
  const prisma = {
    user: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    pointEvent: { count: jest.fn(), findMany: jest.fn() },
    claimCode: { count: jest.fn() },
    rewardRedemption: {
      count: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
  };
  let service: AdminParticipantsService;
  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.pointEvent.count.mockResolvedValue(0);
    prisma.claimCode.count.mockResolvedValue(0);
    prisma.rewardRedemption.groupBy.mockResolvedValue([]);
    const module = await Test.createTestingModule({
      providers: [
        AdminParticipantsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AdminParticipantsService);
  });

  it('searches participants with status filter and pagination', async () => {
    prisma.user.count.mockResolvedValue(1);
    prisma.user.findMany.mockResolvedValue([]);
    await service.findAll({
      page: 2,
      limit: 20,
      search: '  Ana  ',
      status: 'active',
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 20,
        where: {
          role: UserRole.PARTICIPANT,
          isActive: true,
          OR: [
            { name: { contains: 'Ana', mode: 'insensitive' } },
            { email: { contains: 'Ana', mode: 'insensitive' } },
            { cpf: { contains: 'Ana' } },
          ],
        },
      }),
    );
  });

  it('filters inactive participants', async () => {
    prisma.user.count.mockResolvedValue(0);
    prisma.user.findMany.mockResolvedValue([]);

    await service.findAll({ page: 1, limit: 20, status: 'inactive' });

    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { role: UserRole.PARTICIPANT, isActive: false },
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: UserRole.PARTICIPANT, isActive: false },
      }),
    );
  });

  it('maps event and redemption counters for every listed participant', async () => {
    const now = new Date('2026-07-11T12:00:00.000Z');
    prisma.user.count.mockResolvedValue(2);
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'p1',
        name: 'Ana',
        cpf: '1',
        email: 'ana@example.com',
        points: 10,
        xp: 20,
        level: 2,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        _count: { pointEvents: 3, rewardRedemptions: 1 },
      },
      {
        id: 'p2',
        name: 'Bia',
        cpf: '2',
        email: 'bia@example.com',
        points: 0,
        xp: 0,
        level: 1,
        isActive: false,
        createdAt: now,
        updatedAt: now,
        _count: { pointEvents: 7, rewardRedemptions: 4 },
      },
    ]);

    const result = await service.findAll({ page: 1, limit: 20 });

    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'p1',
        actionRedemptionsCount: 3,
        pendingRewardRedemptionsCount: 1,
      }),
      expect.objectContaining({
        id: 'p2',
        actionRedemptionsCount: 7,
        pendingRewardRedemptionsCount: 4,
      }),
    ]);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true,
          name: true,
          cpf: true,
          email: true,
          points: true,
          xp: true,
          level: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          lastLoginAt: true,
          _count: {
            select: {
              pointEvents: {
                where: { source: PointEventSource.ACTION_REDEEM },
              },
              rewardRedemptions: { where: { status: 'PENDING' } },
            },
          },
        },
      }),
    );
  });

  it('returns an empty page beyond the total while preserving metadata', async () => {
    prisma.user.count.mockResolvedValue(1);
    prisma.user.findMany.mockResolvedValue([]);

    await expect(service.findAll({ page: 2, limit: 20 })).resolves.toEqual({
      items: [],
      meta: { page: 2, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it('returns 404 when status update targets an admin or missing id', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.updateStatus('admin', { isActive: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'admin', role: UserRole.PARTICIPANT },
      data: { isActive: false },
    });
  });

  it('updates participant status and returns the refreshed participant', async () => {
    const now = new Date('2026-07-11T12:00:00.000Z');
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findFirst.mockResolvedValue({
      id: 'p1',
      name: 'Ana',
      cpf: '1',
      email: 'ana@example.com',
      points: 5,
      xp: 10,
      level: 2,
      isActive: false,
      createdAt: now,
      updatedAt: now,
      _count: { pointEvents: 2, rewardRedemptions: 1 },
    });

    await expect(
      service.updateStatus('p1', { isActive: false }),
    ).resolves.toMatchObject({
      id: 'p1',
      isActive: false,
      actionRedemptionsCount: 2,
      pendingRewardRedemptionsCount: 1,
    });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', role: UserRole.PARTICIPANT },
      data: { isActive: false },
    });
  });

  it('returns participant detail with counts and rejects admins', async () => {
    prisma.user.findFirst.mockResolvedValueOnce({
      id: 'p1',
      name: 'Ana',
      cpf: '1',
      email: 'a@a',
      points: 5,
      xp: 10,
      level: 2,
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      _count: { pointEvents: 2, rewardRedemptions: 1 },
    });
    prisma.pointEvent.count.mockResolvedValue(2);
    prisma.claimCode.count.mockResolvedValue(1);
    prisma.rewardRedemption.groupBy.mockResolvedValue([]);
    await expect(service.findOne('p1')).resolves.toMatchObject({
      id: 'p1',
      lastLoginAt: null,
      // Jest asymmetric matchers are intentionally untyped in expected objects.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      counts: expect.objectContaining({
        actionRedemptions: 2,
        claimCodes: 1,
        movements: 2,
      }),
    });
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1', role: UserRole.PARTICIPANT },
        // Jest asymmetric matchers are intentionally untyped inside mock calls.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        select: expect.objectContaining({ lastLoginAt: true }),
      }),
    );
    prisma.user.findFirst.mockResolvedValueOnce(null);
    await expect(service.findOne('admin')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('paginates point events, filters enums and returns a summarized claim code', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.pointEvent.count.mockResolvedValue(1);
    prisma.pointEvent.findMany.mockResolvedValue([
      {
        id: 'e1',
        points: 30,
        kind: PointEventKind.CREDIT,
        source: PointEventSource.ACTION_REDEEM,
        redemptionMethod: 'CLAIM_CODE',
        description: null,
        createdAt: new Date(),
        action: { id: 'a1', name: 'Check-in' },
        claimCode: { id: 'claim-1', code: 'ABC123' },
      },
    ]);
    const result = await service.findPointEvents('p1', {
      page: 1,
      limit: 20,
      source: 'action_redeem',
      kind: 'credit',
    });
    expect(result.items[0]).toMatchObject({
      xpDelta: 30,
      origin: 'UNIQUE_CODE',
      claimCode: { id: 'claim-1', code: 'ABC123' },
    });
    expect(prisma.pointEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'p1',
          source: PointEventSource.ACTION_REDEEM,
          kind: PointEventKind.CREDIT,
        },
        // Jest asymmetric matchers are intentionally untyped inside mock calls.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        select: expect.objectContaining({
          claimCode: { select: { id: true, code: true } },
        }),
      }),
    );
  });

  it('returns stable origin enums independently of legacy labels', async () => {
    const createdAt = new Date('2026-07-12T12:00:00.000Z');
    prisma.user.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.pointEvent.count.mockResolvedValue(2);
    prisma.pointEvent.findMany.mockResolvedValue([
      {
        id: 'e-empty',
        points: 10,
        kind: PointEventKind.CREDIT,
        source: PointEventSource.ACTION_REDEEM,
        redemptionMethod: null,
        description: '  Descrição preservada  ',
        createdAt,
        action: { id: 'a1', name: '' },
        claimCode: null,
      },
      {
        id: 'e-whitespace',
        points: 5,
        kind: PointEventKind.CREDIT,
        source: PointEventSource.ADMIN_GRANT,
        redemptionMethod: null,
        description: '   ',
        createdAt,
        action: { id: 'a2', name: ' \t ' },
        claimCode: null,
      },
    ]);

    const result = await service.findPointEvents('p1', {
      page: 1,
      limit: 20,
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'e-empty',
        origin: 'DIRECT_ACTION',
      }),
      expect.objectContaining({
        id: 'e-whitespace',
        origin: 'ADMIN',
      }),
    ]);
  });

  it.each(['admin', 'missing'])(
    'rejects %s id before querying point events',
    async (id) => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.findPointEvents(id, { page: 1, limit: 20 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { id, role: UserRole.PARTICIPANT },
        select: { id: true },
      });
      expect(prisma.pointEvent.count).not.toHaveBeenCalled();
      expect(prisma.pointEvent.findMany).not.toHaveBeenCalled();
    },
  );

  it('paginates reward redemptions by status', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.rewardRedemption.count.mockResolvedValue(0);
    prisma.rewardRedemption.findMany.mockResolvedValue([]);
    await service.findRewardRedemptions('p1', {
      page: 1,
      limit: 20,
      status: RedemptionStatus.PENDING,
    });
    expect(prisma.rewardRedemption.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'p1', status: RedemptionStatus.PENDING },
      }),
    );
  });

  it.each(['admin', 'missing'])(
    'rejects %s id before querying reward redemptions',
    async (id) => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.findRewardRedemptions(id, { page: 1, limit: 20 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { id, role: UserRole.PARTICIPANT },
        select: { id: true },
      });
      expect(prisma.rewardRedemption.count).not.toHaveBeenCalled();
      expect(prisma.rewardRedemption.findMany).not.toHaveBeenCalled();
    },
  );
});
