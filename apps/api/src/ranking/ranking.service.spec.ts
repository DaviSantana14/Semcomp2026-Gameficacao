import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RankingService } from './ranking.service';

const baseDate = new Date('2026-05-17T12:00:00.000Z');

function createUser(
  id: string,
  name: string,
  xp: number,
  createdAt = baseDate,
) {
  return {
    id,
    name,
    xp,
    createdAt,
  };
}

function createService() {
  const prisma = {
    user: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
  };

  return {
    service: new RankingService(prisma as never),
    prisma,
  };
}

describe('RankingService', () => {
  it('returns the top participants ordered by xp desc with stable tiebreakers', async () => {
    const { service, prisma } = createService();

    prisma.user.findMany.mockResolvedValue([
      createUser('user-high', 'Grace Hopper', 200),
      createUser(
        'user-old',
        'Ada Lovelace',
        100,
        new Date('2026-05-17T10:00:00.000Z'),
      ),
      createUser(
        'user-new',
        'Katherine Johnson',
        100,
        new Date('2026-05-17T11:00:00.000Z'),
      ),
    ]);
    prisma.user.findFirst.mockResolvedValue(
      createUser('user-high', 'Grace Hopper', 200),
    );

    const result = await service.getGeneralRanking('user-high', '3');

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        role: UserRole.PARTICIPANT,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        xp: true,
        createdAt: true,
      },
      orderBy: [{ xp: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: 3,
    });
    expect(result).toEqual({
      ranking: [
        { position: 1, name: 'Grace Hopper', xp: 200 },
        { position: 2, name: 'Ada Lovelace', xp: 100 },
        { position: 3, name: 'Katherine Johnson', xp: 100 },
      ],
      me: { position: 1, name: 'Grace Hopper', xp: 200 },
    });
  });

  it('uses only participant active users for top and current user eligibility', async () => {
    const { service, prisma } = createService();

    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.findFirst.mockResolvedValue(null);

    const result = await service.getGeneralRanking('admin-1');

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          role: UserRole.PARTICIPANT,
          isActive: true,
        },
        take: 10,
      }),
    );
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'admin-1',
        role: UserRole.PARTICIPANT,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        xp: true,
        createdAt: true,
      },
    });
    expect(result).toEqual({
      ranking: [],
      me: null,
    });
  });

  it('returns the current participant position when they are outside the top list', async () => {
    const { service, prisma } = createService();
    const currentUser = createUser(
      'user-current',
      'Mary Jackson',
      50,
      new Date('2026-05-17T13:00:00.000Z'),
    );

    prisma.user.findMany.mockResolvedValue([
      createUser('user-1', 'Grace Hopper', 200),
      createUser('user-2', 'Ada Lovelace', 150),
    ]);
    prisma.user.findFirst.mockResolvedValue(currentUser);
    prisma.user.count.mockResolvedValue(8);

    const result = await service.getGeneralRanking('user-current', '2');

    expect(prisma.user.count).toHaveBeenCalledWith({
      where: {
        role: UserRole.PARTICIPANT,
        isActive: true,
        OR: [
          { xp: { gt: 50 } },
          {
            xp: 50,
            createdAt: { lt: currentUser.createdAt },
          },
          {
            xp: 50,
            createdAt: currentUser.createdAt,
            id: { lt: 'user-current' },
          },
        ],
      },
    });
    expect(result.me).toEqual({ position: 9, name: 'Mary Jackson', xp: 50 });
  });

  it('returns me as null when the authenticated user is not an eligible participant', async () => {
    const { service, prisma } = createService();

    prisma.user.findMany.mockResolvedValue([
      createUser('user-1', 'Ada Lovelace', 100),
    ]);
    prisma.user.findFirst.mockResolvedValue(null);

    const result = await service.getGeneralRanking('admin-1');

    expect(prisma.user.count).not.toHaveBeenCalled();
    expect(result.me).toBeNull();
  });

  it('accepts limit 50 and rejects invalid limits', async () => {
    const { service, prisma } = createService();

    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.findFirst.mockResolvedValue(null);

    await service.getGeneralRanking('user-1', '50');

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 }),
    );
    await expect(service.getGeneralRanking('user-1', '0')).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.getGeneralRanking('user-1', '51')).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.getGeneralRanking('user-1', 'abc')).rejects.toThrow(
      BadRequestException,
    );
  });
});
