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
    rewardRedemption: { count: jest.fn(), findMany: jest.fn() },
  };
  let service: AdminParticipantsService;
  beforeEach(async () => {
    jest.clearAllMocks();
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
      createdAt: new Date(),
      updatedAt: new Date(),
      _count: { pointEvents: 2, rewardRedemptions: 1 },
    });
    await expect(service.findOne('p1')).resolves.toMatchObject({
      id: 'p1',
      pointEventsCount: 2,
      rewardRedemptionsCount: 1,
    });
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1', role: UserRole.PARTICIPANT },
      }),
    );
    prisma.user.findFirst.mockResolvedValueOnce(null);
    await expect(service.findOne('admin')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('paginates point events, filters enums and derives xp delta and origin', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.pointEvent.count.mockResolvedValue(1);
    prisma.pointEvent.findMany.mockResolvedValue([
      {
        id: 'e1',
        points: 30,
        kind: PointEventKind.CREDIT,
        source: PointEventSource.ACTION_REDEEM,
        redemptionMethod: null,
        description: null,
        createdAt: new Date(),
        action: { id: 'a1', name: 'Check-in' },
      },
    ]);
    const result = await service.findPointEvents('p1', {
      page: 1,
      limit: 20,
      source: PointEventSource.ACTION_REDEEM,
      kind: PointEventKind.CREDIT,
    });
    expect(result.items[0]).toMatchObject({ xpDelta: 30, origin: 'Check-in' });
    expect(prisma.pointEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'p1',
          source: PointEventSource.ACTION_REDEEM,
          kind: PointEventKind.CREDIT,
        },
      }),
    );
  });

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
});
