import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  PointEventKind,
  PointEventSource,
  RedemptionStatus,
  UserRole,
} from '@prisma/client';
import { AdminParticipantsRepository } from '../admin-participants.repository';
import { AdminParticipantsService } from '../admin-participants.service';
import { AuditService } from '../../audit/audit.service';

describe(AdminParticipantsService.name, () => {
  const queryRaw = jest.fn();
  const prisma = {
    user: {
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    pointEvent: { count: jest.fn(), findMany: jest.fn() },
    claimCode: { count: jest.fn() },
    rewardRedemption: {
      count: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    $queryRaw: queryRaw,
    $transaction: jest.fn(),
  };
  let service: AdminParticipantsService;
  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => unknown) => callback(prisma),
    );
    queryRaw.mockImplementation(async () => {
      const result = (await prisma.user.findFirst()) as {
        id: string;
        isActive: boolean;
      } | null;
      return result ? [result] : [];
    });
    prisma.pointEvent.count.mockResolvedValue(0);
    prisma.claimCode.count.mockResolvedValue(0);
    prisma.rewardRedemption.groupBy.mockResolvedValue([]);
    const module = await Test.createTestingModule({
      providers: [
        AdminParticipantsService,
        {
          provide: AdminParticipantsRepository,
          useValue: new AdminParticipantsRepository(prisma as never),
        },
        { provide: AuditService, useValue: { record: jest.fn() } },
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
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(
      service.updateStatus(
        'admin',
        { isActive: false, reason: 'Desativacao operacional confirmada' },
        { actorAdminId: 'admin-1', requestId: 'request-1' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('updates participant status and returns the refreshed participant', async () => {
    const now = new Date('2026-07-11T12:00:00.000Z');
    prisma.user.update.mockResolvedValue({ id: 'p1', isActive: false });
    prisma.user.findFirst
      .mockResolvedValueOnce({ id: 'p1', isActive: true })
      .mockResolvedValueOnce({
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
      service.updateStatus(
        'p1',
        { isActive: false, reason: 'Desativacao operacional confirmada' },
        { actorAdminId: 'admin-1', requestId: 'request-1' },
      ),
    ).resolves.toMatchObject({
      id: 'p1',
      isActive: false,
      actionRedemptionsCount: 2,
      pendingRewardRedemptionsCount: 1,
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { isActive: false },
      select: { id: true, isActive: true },
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
    const createdAt = new Date('2026-07-12T12:00:00.000Z');
    prisma.user.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.pointEvent.count.mockResolvedValue(1);
    prisma.pointEvent.findMany.mockResolvedValue([
      {
        id: 'e1',
        points: 30,
        xpDelta: 9,
        kind: PointEventKind.CREDIT,
        source: PointEventSource.ACTION_REDEEM,
        redemptionMethod: 'CLAIM_CODE',
        description: null,
        createdAt,
        action: { id: 'a1', name: 'Check-in' },
        claimCode: { id: 'claim-1', code: 'ABC123' },
        auditEventId: 'audit-1',
        reversedEventId: null,
        reversal: { id: 'reversal-1' },
      },
    ]);
    const result = await service.findPointEvents('p1', {
      page: 1,
      limit: 20,
      source: 'action_redeem',
      kind: 'credit',
    });
    expect(result.items[0]).toEqual({
      id: 'e1',
      points: 30,
      xpDelta: 9,
      kind: PointEventKind.CREDIT,
      source: PointEventSource.ACTION_REDEEM,
      redemptionMethod: 'CLAIM_CODE',
      description: null,
      action: { id: 'a1', name: 'Check-in' },
      origin: 'UNIQUE_CODE',
      claimCode: { id: 'claim-1', code: 'ABC123' },
      isAudited: true,
      reversalOfPointEventId: null,
      reversalPointEventId: 'reversal-1',
      createdAt: createdAt.toISOString(),
    });
    expect(result.items[0]).not.toHaveProperty('reversedEventId');
    expect(result.items[0]).not.toHaveProperty('reversal');
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

  it('keeps unknown legacy origin explicit and exposes missing audit honestly', async () => {
    const createdAt = new Date('2026-07-12T12:00:00.000Z');
    prisma.user.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.pointEvent.count.mockResolvedValue(3);
    prisma.pointEvent.findMany.mockResolvedValue([
      {
        id: 'e-empty',
        points: 10,
        xpDelta: 3,
        kind: PointEventKind.CREDIT,
        source: PointEventSource.ACTION_REDEEM,
        redemptionMethod: 'LEGACY_UNKNOWN',
        description: '  Descrição preservada  ',
        createdAt,
        action: { id: 'a1', name: '' },
        claimCode: null,
        auditEventId: null,
        reversedEventId: null,
        reversal: null,
      },
      {
        id: 'e-whitespace',
        points: 5,
        xpDelta: 11,
        kind: PointEventKind.CREDIT,
        source: PointEventSource.ADMIN_GRANT,
        redemptionMethod: null,
        description: '   ',
        createdAt,
        action: { id: 'a2', name: ' \t ' },
        claimCode: null,
        auditEventId: 'audit-admin',
        reversedEventId: null,
        reversal: null,
      },
      {
        id: 'e-unknown-source',
        points: 2,
        xpDelta: 1,
        kind: PointEventKind.CREDIT,
        source: 'LEGACY_UNKNOWN',
        redemptionMethod: null,
        description: 'Importação histórica',
        createdAt,
        action: null,
        claimCode: null,
        auditEventId: null,
        reversedEventId: null,
        reversal: null,
      },
    ]);

    const result = await service.findPointEvents('p1', {
      page: 1,
      limit: 20,
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'e-empty',
        xpDelta: 3,
        origin: 'LEGACY_UNKNOWN',
        isAudited: false,
      }),
      expect.objectContaining({
        id: 'e-whitespace',
        xpDelta: 11,
        origin: 'ADMIN',
        isAudited: true,
      }),
      expect.objectContaining({
        id: 'e-unknown-source',
        origin: 'LEGACY_UNKNOWN',
        isAudited: false,
      }),
    ]);
  });

  it('identifies reconciliation compensation separately in participant history', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.pointEvent.count.mockResolvedValue(1);
    prisma.pointEvent.findMany.mockResolvedValue([
      {
        id: 'compensation-1',
        points: 4,
        xpDelta: 2,
        kind: PointEventKind.CREDIT,
        source: PointEventSource.ADMIN_ADJUST,
        redemptionMethod: null,
        description: 'Correcao operacional confirmada',
        createdAt: new Date('2026-07-14T12:00:00.000Z'),
        action: null,
        claimCode: null,
        auditEventId: 'audit-1',
        auditEvent: { operation: 'RECONCILIATION_ADJUSTMENT_CONFIRMED' },
        reversedEventId: null,
        reversal: null,
      },
    ]);

    const result = await service.findPointEvents('p1', { page: 1, limit: 20 });

    expect(result.items[0]).toMatchObject({
      source: PointEventSource.ADMIN_ADJUST,
      origin: 'RECONCILIATION_COMPENSATION',
      isAudited: true,
    });
    expect(result.items[0]).not.toHaveProperty('auditEvent');
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
      status: 'pending',
    });
    expect(prisma.rewardRedemption.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'p1', status: RedemptionStatus.PENDING },
      }),
    );
  });

  it('omits the Prisma reward-redemption status filter for all', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.rewardRedemption.count.mockResolvedValue(0);
    prisma.rewardRedemption.findMany.mockResolvedValue([]);

    await service.findRewardRedemptions('p1', {
      page: 1,
      limit: 20,
      status: 'all',
    });

    expect(prisma.rewardRedemption.count).toHaveBeenCalledWith({
      where: { userId: 'p1' },
    });
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
