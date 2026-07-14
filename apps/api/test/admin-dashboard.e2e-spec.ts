import {
  ActionRedemptionMethod,
  ActionType,
  PointEventKind,
  PointEventSource,
  RedemptionStatus,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AdminE2eHarness, AuthSession } from './support/admin-e2e-harness';

type Page<T> = {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

type Dashboard = {
  participants: { total: number; active: number; inactive: number };
  activity: { redemptions: number; pointsIssued: number };
  codes: {
    uniqueTotal: number;
    uniqueAvailable: number;
    uniqueUsed: number;
    reusableTotal: number;
    reusableActive: number;
  };
  shop: {
    rewardsTotal: number;
    rewardsActive: number;
    outOfStock: number;
    pendingRedemptions: number;
  };
};

describe('Admin dashboard (e2e)', () => {
  let harness: AdminE2eHarness;
  let adminSession: AuthSession;
  let admin: { id: string; email: string };
  const userIds: string[] = [];
  const actionIds: string[] = [];
  const claimCodeIds: string[] = [];
  const rewardIds: string[] = [];

  beforeAll(async () => {
    harness = await AdminE2eHarness.create();
    const suffix = randomUUID();
    const users = await Promise.all([
      harness.prisma.user.create({
        data: {
          name: `Dashboard admin ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 1),
          email: `dashboard-admin-${suffix}@example.test`,
          role: UserRole.ADMIN,
        },
      }),
      harness.prisma.user.create({
        data: {
          name: `Dashboard active ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 2),
          email: `dashboard-active-${suffix}@example.test`,
          points: 30,
          xp: 30,
        },
      }),
      harness.prisma.user.create({
        data: {
          name: `Dashboard inactive ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 3),
          email: `dashboard-inactive-${suffix}@example.test`,
          isActive: false,
        },
      }),
    ]);
    [admin] = users;
    userIds.push(...users.map(({ id }) => id));

    const [claimAction, reusableAction] = await Promise.all([
      harness.prisma.action.create({
        data: {
          name: `Dashboard claim ${suffix}`,
          type: ActionType.CHECKIN,
          points: 11,
        },
      }),
      harness.prisma.action.create({
        data: {
          name: `Dashboard reusable ${suffix}`,
          type: ActionType.BONUS,
          code: `DASHBOARD-${suffix}`.toUpperCase(),
          points: 19,
          isCodeActive: true,
        },
      }),
    ]);
    actionIds.push(claimAction.id, reusableAction.id);

    const codes = await Promise.all([
      harness.prisma.claimCode.create({
        data: { code: claimCodeFor(suffix, 1), actionId: claimAction.id },
      }),
      harness.prisma.claimCode.create({
        data: {
          code: claimCodeFor(suffix, 2),
          actionId: claimAction.id,
          isUsed: true,
          isActive: false,
          usedById: users[1].id,
          usedAt: new Date(),
        },
      }),
      harness.prisma.claimCode.create({
        data: {
          code: claimCodeFor(suffix, 3),
          actionId: claimAction.id,
          isActive: false,
        },
      }),
    ]);
    claimCodeIds.push(...codes.map(({ id }) => id));

    await harness.prisma.pointEvent.createMany({
      data: [
        {
          userId: users[1].id,
          actionId: claimAction.id,
          claimCodeId: codes[1].id,
          points: 11,
          kind: PointEventKind.CREDIT,
          source: PointEventSource.ACTION_REDEEM,
          redemptionMethod: ActionRedemptionMethod.CLAIM_CODE,
        },
        {
          userId: users[1].id,
          actionId: reusableAction.id,
          points: 19,
          kind: PointEventKind.CREDIT,
          source: PointEventSource.ACTION_REDEEM,
          redemptionMethod: ActionRedemptionMethod.REUSABLE_CODE,
        },
      ],
    });

    const reward = await harness.prisma.reward.create({
      data: {
        name: `Dashboard reward ${suffix}`,
        costInPoints: 25,
        stock: 10,
      },
    });
    rewardIds.push(reward.id);
    await harness.prisma.rewardRedemption.create({
      data: {
        userId: users[1].id,
        rewardId: reward.id,
        pointsSpent: 25,
        status: RedemptionStatus.PENDING,
      },
    });

    adminSession = await harness.login(users[0].cpf, users[0].email);
  });

  afterAll(async () => {
    if (harness) await harness.close();
  });

  it('reports exact totals without counting admin accounts as participants', async () => {
    const dashboard = await dashboardMatchingDatabase();
    expect(Number.isInteger(dashboard.activity.redemptions)).toBe(true);
    expect(Number.isInteger(dashboard.activity.pointsIssued)).toBe(true);

    const [fixtureParticipants, fixturePoints, fixtureCodes, fixtureRewards] =
      await Promise.all([
        harness.prisma.user.count({
          where: { id: { in: userIds }, role: UserRole.PARTICIPANT },
        }),
        harness.prisma.pointEvent.aggregate({
          where: {
            actionId: { in: actionIds },
            source: PointEventSource.ACTION_REDEEM,
          },
          _sum: { points: true },
        }),
        harness.prisma.claimCode.groupBy({
          by: ['isUsed', 'isActive'],
          where: { id: { in: claimCodeIds } },
          _count: { _all: true },
        }),
        harness.prisma.reward.findUniqueOrThrow({
          where: { id: rewardIds[0] },
        }),
      ]);
    expect(fixtureParticipants).toBe(2);
    expect(fixturePoints._sum.points).toBe(30);
    expect(fixtureCodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ isUsed: true, _count: { _all: 1 } }),
        expect.objectContaining({
          isUsed: false,
          isActive: true,
          _count: { _all: 1 },
        }),
        expect.objectContaining({
          isUsed: false,
          isActive: false,
          _count: { _all: 1 },
        }),
      ]),
    );
    expect(fixtureRewards).toMatchObject({ stock: 10, isActive: true });

    const adminSearch = await harness
      .get(
        `/admin/participants?search=${encodeURIComponent(admin.email)}`,
        adminSession,
      )
      .expect(200);
    expect((adminSearch.body as Page<unknown>).meta.total).toBe(0);
  });

  async function dashboardMatchingDatabase(): Promise<Dashboard> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await harness
        .get('/admin/dashboard', adminSession)
        .expect(200);
      const actual = response.body as Dashboard;
      const [
        total,
        active,
        inactive,
        points,
        uniqueTotal,
        used,
        available,
        reusableTotal,
        reusableActive,
        rewardsTotal,
        rewardsActive,
        outOfStock,
        pendingRedemptions,
      ] = await Promise.all([
        harness.prisma.user.count({ where: { role: UserRole.PARTICIPANT } }),
        harness.prisma.user.count({
          where: { role: UserRole.PARTICIPANT, isActive: true },
        }),
        harness.prisma.user.count({
          where: { role: UserRole.PARTICIPANT, isActive: false },
        }),
        harness.prisma.pointEvent.aggregate({
          where: {
            source: PointEventSource.ACTION_REDEEM,
            user: { role: UserRole.PARTICIPANT },
          },
          _count: { _all: true },
          _sum: { points: true },
        }),
        harness.prisma.claimCode.count(),
        harness.prisma.claimCode.count({ where: { isUsed: true } }),
        harness.prisma.claimCode.count({
          where: { isUsed: false, isActive: true, action: { isActive: true } },
        }),
        harness.prisma.action.count({ where: { code: { not: null } } }),
        harness.prisma.action.count({
          where: { code: { not: null }, isActive: true, isCodeActive: true },
        }),
        harness.prisma.reward.count(),
        harness.prisma.reward.count({ where: { isActive: true } }),
        harness.prisma.reward.count({ where: { stock: 0, isActive: true } }),
        harness.prisma.rewardRedemption.count({
          where: { status: RedemptionStatus.PENDING },
        }),
      ]);
      const expected: Dashboard = {
        participants: { total, active, inactive },
        activity: {
          redemptions: points._count._all,
          pointsIssued: points._sum.points ?? 0,
        },
        codes: {
          uniqueTotal,
          uniqueAvailable: available,
          uniqueUsed: used,
          reusableTotal,
          reusableActive,
        },
        shop: { rewardsTotal, rewardsActive, outOfStock, pendingRedemptions },
      };
      if (
        JSON.stringify(actual.participants) ===
          JSON.stringify(expected.participants) &&
        JSON.stringify(actual.activity) === JSON.stringify(expected.activity) &&
        JSON.stringify(actual.codes) === JSON.stringify(expected.codes) &&
        JSON.stringify(actual.shop) === JSON.stringify(expected.shop)
      ) {
        expect(actual).toMatchObject(expected);
        return actual;
      }
    }
    throw new Error(
      'Dashboard did not stabilize against exact database totals.',
    );
  }
});

function claimCodeFor(suffix: string, discriminator: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const source = `${discriminator}${suffix}`.replace(/-/g, '').toUpperCase();
  const encoded = Array.from({ length: 8 }, (_, index) =>
    alphabet.charAt(source.charCodeAt(index % source.length) % alphabet.length),
  ).join('');
  return `${encoded.slice(0, 4)}-${encoded.slice(4)}`;
}
