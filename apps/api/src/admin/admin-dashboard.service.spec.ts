import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Test } from '@nestjs/testing';
import { PointEventSource, RedemptionStatus, UserRole } from '@prisma/client';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { paginate } from '../common/dto/pagination-response.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AdminDashboardService } from './admin-dashboard.service';

describe('shared pagination', () => {
  it('transforms defaults and numeric query strings', async () => {
    const defaults = plainToInstance(PaginationQueryDto, {});
    const custom = plainToInstance(PaginationQueryDto, {
      page: '2',
      limit: '100',
    });
    expect(defaults).toMatchObject({ page: 1, limit: 20 });
    expect(custom).toMatchObject({ page: 2, limit: 100 });
    expect(await validate(custom)).toHaveLength(0);
  });

  it('rejects page below 1 and limit above 100', async () => {
    const dto = plainToInstance(PaginationQueryDto, {
      page: '0',
      limit: '101',
    });
    expect(await validate(dto)).toHaveLength(2);
  });

  it('rejects limit below 1 and accepts page above 1', async () => {
    const invalid = plainToInstance(PaginationQueryDto, {
      page: '2',
      limit: '0',
    });
    const valid = plainToInstance(PaginationQueryDto, {
      page: '37',
      limit: '100',
    });

    const errors = await validate(invalid);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('limit');
    expect(await validate(valid)).toHaveLength(0);
    expect(valid).toMatchObject({ page: 37, limit: 100 });
  });

  it('builds page metadata, including an empty result', () => {
    expect(paginate(['x'], 21, 2, 20)).toEqual({
      items: ['x'],
      meta: { page: 2, limit: 20, total: 21, totalPages: 2 },
    });
    expect(paginate([], 0, 1, 20).meta.totalPages).toBe(0);
  });
});

describe(AdminDashboardService.name, () => {
  const prisma = {
    user: { count: jest.fn() },
    pointEvent: { aggregate: jest.fn() },
    claimCode: { count: jest.fn() },
    rewardRedemption: { findMany: jest.fn() },
  };
  let service: AdminDashboardService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AdminDashboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AdminDashboardService);
  });

  it('returns participant metrics, action points, code split and five recent requests', async () => {
    prisma.user.count.mockResolvedValueOnce(12).mockResolvedValueOnce(9);
    prisma.pointEvent.aggregate.mockResolvedValue({ _sum: { points: 340 } });
    prisma.claimCode.count.mockResolvedValueOnce(7).mockResolvedValueOnce(13);
    prisma.rewardRedemption.findMany.mockResolvedValue([
      {
        id: 'r1',
        pointsSpent: 10,
        status: 'PENDING',
        createdAt: new Date('2026-07-11T12:00:00.000Z'),
        user: { id: 'p1', name: 'Ana' },
        reward: { id: 'reward-1', name: 'Caneca' },
      },
    ]);
    await expect(service.getOverview()).resolves.toMatchObject({
      participants: { total: 12, active: 9 },
      pointsAwarded: 340,
      claimCodes: { used: 7, available: 13 },
      recentPendingRedemptions: [
        expect.objectContaining({ createdAt: '2026-07-11T12:00:00.000Z' }),
      ],
    });
    expect(prisma.user.count).toHaveBeenNthCalledWith(1, {
      where: { role: UserRole.PARTICIPANT },
    });
    expect(prisma.user.count).toHaveBeenNthCalledWith(2, {
      where: { role: UserRole.PARTICIPANT, isActive: true },
    });
    expect(prisma.pointEvent.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { source: PointEventSource.ACTION_REDEEM },
      }),
    );
    expect(prisma.rewardRedemption.findMany).toHaveBeenCalledWith({
      where: { status: RedemptionStatus.PENDING },
      take: 5,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        pointsSpent: true,
        status: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
        reward: { select: { id: true, name: true } },
      },
    });
    expect(prisma.claimCode.count).toHaveBeenNthCalledWith(1, {
      where: { isUsed: true },
    });
    expect(prisma.claimCode.count).toHaveBeenNthCalledWith(2, {
      where: { isUsed: false, isActive: true },
    });
  });
});
