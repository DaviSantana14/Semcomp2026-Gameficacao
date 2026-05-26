import { BadRequestException, Injectable } from '@nestjs/common';
import { PointEventKind, PointEventSource, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const RANKING_TIME_ZONE = 'America/Sao_Paulo';
const RANKING_PERIODS = ['all', 'daily', 'weekly'] as const;

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

type RankingPeriod = (typeof RANKING_PERIODS)[number];
type RankingOptions = {
  limit?: string;
  period?: string;
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

  async getRanking(userId: string, options: RankingOptions = {}) {
    const period = this.parsePeriod(options.period);

    if (period === 'all') {
      return this.getGeneralRanking(userId, options.limit);
    }

    return this.getPeriodRanking(userId, options.limit, period);
  }

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

  private async getPeriodRanking(
    userId: string,
    limitQuery: string | undefined,
    period: Exclude<RankingPeriod, 'all'>,
  ) {
    const limit = this.parseLimit(limitQuery);
    const window = getPeriodWindow(period, new Date());
    const eligibilityWhere = {
      role: UserRole.PARTICIPANT,
      isActive: true,
    } as const;

    const [eligibleUsers, eventGroups] = await Promise.all([
      this.prisma.user.findMany({
        where: eligibilityWhere,
        select: rankingUserSelect,
      }),
      this.prisma.pointEvent.groupBy({
        by: ['userId'],
        where: {
          kind: PointEventKind.CREDIT,
          source: PointEventSource.ACTION_REDEEM,
          createdAt: {
            gte: window.start,
            lt: window.end,
          },
        },
        _sum: {
          points: true,
        },
      }),
    ]);

    const xpByUserId = new Map(
      eventGroups.map((group) => [group.userId, group._sum.points ?? 0]),
    );

    const rankedUsers = eligibleUsers
      .map((user) => ({
        ...user,
        xp: xpByUserId.get(user.id) ?? 0,
      }))
      .sort(compareRankingUsers);

    const ranking = rankedUsers
      .slice(0, limit)
      .map((user, index) => toRankingEntry(user, index + 1));

    const currentUserIndex = rankedUsers.findIndex((user) => user.id === userId);

    return {
      ranking,
      me:
        currentUserIndex >= 0
          ? toRankingEntry(rankedUsers[currentUserIndex], currentUserIndex + 1)
          : null,
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

  private parsePeriod(periodQuery?: string): RankingPeriod {
    if (periodQuery === undefined || periodQuery === '') {
      return 'all';
    }

    if (RANKING_PERIODS.includes(periodQuery as RankingPeriod)) {
      return periodQuery as RankingPeriod;
    }

    throw new BadRequestException('period deve ser daily, weekly ou all.');
  }
}

function compareRankingUsers(left: RankingUser, right: RankingUser) {
  if (left.xp !== right.xp) {
    return right.xp - left.xp;
  }

  const createdAtDifference = left.createdAt.getTime() - right.createdAt.getTime();

  if (createdAtDifference !== 0) {
    return createdAtDifference;
  }

  return left.id.localeCompare(right.id);
}

function getPeriodWindow(period: Exclude<RankingPeriod, 'all'>, now: Date) {
  const startOfToday = getZonedStartOfDayUtc(now, RANKING_TIME_ZONE);

  if (period === 'daily') {
    return {
      start: startOfToday,
      end: addUtcDays(startOfToday, 1),
    };
  }

  const dayOfWeek = getZonedDayOfWeek(startOfToday, RANKING_TIME_ZONE);
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const startOfWeek = addUtcDays(startOfToday, -daysSinceMonday);

  return {
    start: startOfWeek,
    end: addUtcDays(startOfWeek, 7),
  };
}

function getZonedStartOfDayUtc(date: Date, timeZone: string) {
  const parts = getZonedParts(date, timeZone);
  const utcApproximation = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day),
  );
  const offset = getTimeZoneOffsetInMs(utcApproximation, timeZone);

  return new Date(utcApproximation.getTime() - offset);
}

function getZonedDayOfWeek(date: Date, timeZone: string) {
  const weekDay = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(date);

  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekDay);
}

function getZonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value),
  };
}

function getTimeZoneOffsetInMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  const zonedTime = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second,
  );

  return zonedTime - date.getTime();
}

function addUtcDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
