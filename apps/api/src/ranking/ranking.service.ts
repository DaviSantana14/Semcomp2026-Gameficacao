import { BadRequestException, Injectable } from '@nestjs/common';
import { RankingRepository } from './ranking.repository';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const RANKING_TIME_ZONE = 'America/Sao_Paulo';
const RANKING_PERIODS = ['all', 'daily'] as const;

type RankingUser = {
  id: string;
  name: string;
  xp: number;
  createdAt: Date;
};

type RankingPeriod = (typeof RANKING_PERIODS)[number];
type RankingOptions = { limit?: string; period?: string };

@Injectable()
export class RankingService {
  constructor(private readonly repository: RankingRepository) {}

  async getRanking(userId: string, options: RankingOptions = {}) {
    const period = this.parsePeriod(options.period);
    return period === 'all'
      ? this.getGeneralRanking(userId, options.limit)
      : this.getPeriodRanking(userId, options.limit, period);
  }

  async getGeneralRanking(userId: string, limitQuery?: string) {
    const limit = this.parseLimit(limitQuery);
    const [rankingUsers, currentUser] = await Promise.all([
      this.repository.findTopGeneralRanking(limit),
      this.repository.findEligibleUser(userId),
    ]);
    const ranking = rankingUsers.map((user, index) =>
      toRankingEntry(user, index + 1),
    );
    if (!currentUser) return { ranking, me: null };
    const topIndex = rankingUsers.findIndex(
      (user) => user.id === currentUser.id,
    );
    if (topIndex >= 0) {
      return { ranking, me: toRankingEntry(currentUser, topIndex + 1) };
    }
    const usersBefore = await this.repository.countUsersAhead(currentUser);
    return { ranking, me: toRankingEntry(currentUser, usersBefore + 1) };
  }

  private async getPeriodRanking(
    userId: string,
    limitQuery: string | undefined,
    period: 'daily',
  ) {
    const limit = this.parseLimit(limitQuery);
    const window = getPeriodWindow(period, new Date());
    const [eligibleUsers, eventGroups] = await Promise.all([
      this.repository.findEligibleUsers(),
      this.repository.findActionCreditTotals(window.start, window.end),
    ]);
    const xpByUserId = new Map(
      eventGroups.map(
        (group) => [group.userId, group._sum.xpDelta ?? 0] as const,
      ),
    );
    const rankedUsers = eligibleUsers
      .map((user) => ({ ...user, xp: xpByUserId.get(user.id) ?? 0 }))
      .sort(compareRankingUsers);
    const ranking = rankedUsers
      .filter((user) => user.xp > 0)
      .slice(0, limit)
      .map((user, index) => toRankingEntry(user, index + 1));
    const currentUserIndex = rankedUsers.findIndex(
      (user) => user.id === userId,
    );
    return {
      ranking,
      me:
        currentUserIndex >= 0
          ? toRankingEntry(rankedUsers[currentUserIndex], currentUserIndex + 1)
          : null,
    };
  }

  private parseLimit(limitQuery?: string) {
    if (limitQuery === undefined || limitQuery === '') return DEFAULT_LIMIT;
    const limit = Number(limitQuery);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new BadRequestException(
        `limit deve ser um inteiro entre 1 e ${MAX_LIMIT}.`,
      );
    }
    return limit;
  }

  private parsePeriod(periodQuery?: string): RankingPeriod {
    if (periodQuery === undefined || periodQuery === '') return 'all';
    if (RANKING_PERIODS.includes(periodQuery as RankingPeriod)) {
      return periodQuery as RankingPeriod;
    }
    throw new BadRequestException('period deve ser daily ou all.');
  }
}

function toRankingEntry(user: RankingUser, position: number) {
  return { position, name: user.name, xp: user.xp };
}

function compareRankingUsers(left: RankingUser, right: RankingUser) {
  if (left.xp !== right.xp) return right.xp - left.xp;
  const createdAtDifference =
    left.createdAt.getTime() - right.createdAt.getTime();
  return createdAtDifference || left.id.localeCompare(right.id);
}

function getPeriodWindow(period: 'daily', now: Date) {
  const start = getZonedStartOfDayUtc(now, RANKING_TIME_ZONE);
  return { start, end: addUtcDays(start, 1) };
}

function getZonedStartOfDayUtc(date: Date, timeZone: string) {
  const parts = getZonedParts(date, timeZone);
  const approximation = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day),
  );
  return new Date(
    approximation.getTime() - getTimeZoneOffsetInMs(approximation, timeZone),
  );
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
  return (
    Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second,
    ) - date.getTime()
  );
}

function addUtcDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
