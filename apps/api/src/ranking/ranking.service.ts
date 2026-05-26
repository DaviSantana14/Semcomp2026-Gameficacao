import { BadRequestException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const rankingUserSelect = {
  id: true,
  name: true,
  xp: true,
  createdAt: true,
} as const;

type RankingUser = {
  id: string;
  name: string;
  xp: number;
  createdAt: Date;
};

function toRankingEntry(user: RankingUser, position: number) {
  return {
    position,
    name: user.name,
    xp: user.xp,
  };
}

@Injectable()
export class RankingService {
  constructor(private readonly prisma: PrismaService) {}

  async getGeneralRanking(userId: string, limitQuery?: string) {
    const limit = this.parseLimit(limitQuery);
    const eligibilityWhere = {
      role: UserRole.PARTICIPANT,
      isActive: true,
    } as const;
    const orderBy = [
      { xp: 'desc' as const },
      { createdAt: 'asc' as const },
      { id: 'asc' as const },
    ];

    const [rankingUsers, currentUser] = await Promise.all([
      this.prisma.user.findMany({
        where: eligibilityWhere,
        select: rankingUserSelect,
        orderBy,
        take: limit,
      }),
      this.prisma.user.findFirst({
        where: {
          id: userId,
          ...eligibilityWhere,
        },
        select: rankingUserSelect,
      }),
    ]);

    const ranking = rankingUsers.map((user, index) =>
      toRankingEntry(user, index + 1),
    );

    if (!currentUser) {
      return {
        ranking,
        me: null,
      };
    }

    const userInTop = rankingUsers.find((user) => user.id === currentUser.id);

    if (userInTop) {
      return {
        ranking,
        me: toRankingEntry(
          currentUser,
          rankingUsers.findIndex((user) => user.id === currentUser.id) + 1,
        ),
      };
    }

    const usersBeforeCurrentUser = await this.prisma.user.count({
      where: {
        ...eligibilityWhere,
        OR: [
          { xp: { gt: currentUser.xp } },
          {
            xp: currentUser.xp,
            createdAt: { lt: currentUser.createdAt },
          },
          {
            xp: currentUser.xp,
            createdAt: currentUser.createdAt,
            id: { lt: currentUser.id },
          },
        ],
      },
    });

    return {
      ranking,
      me: toRankingEntry(currentUser, usersBeforeCurrentUser + 1),
    };
  }

  private parseLimit(limitQuery?: string) {
    if (limitQuery === undefined || limitQuery === '') {
      return DEFAULT_LIMIT;
    }

    const limit = Number(limitQuery);

    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new BadRequestException(
        `limit deve ser um inteiro entre 1 e ${MAX_LIMIT}.`,
      );
    }

    return limit;
  }
}
