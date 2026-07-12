import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ActionRedemptionMethod,
  ActionType,
  PointEventKind,
  PointEventSource,
  RedemptionStatus,
  UserRole,
} from '@prisma/client';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import request, { Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type AuthSession = { cookie: string; csrfToken: string };
type Page<T> = {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};
type LoginBody = { csrfToken: string };
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

describe('Admin management acceptance (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: { id: string; cpf: string; email: string };
  let firstParticipant: { id: string; cpf: string; email: string };
  let secondParticipant: { id: string; cpf: string; email: string };
  let adminSession: AuthSession;
  let firstSession: AuthSession;
  let secondSession: AuthSession;
  let claimActionId: string;
  let reusableActionId: string;
  let directActionId: string;
  let legacyActionId: string;
  let availableClaimCodeId: string;
  let usedClaimCodeId: string;
  let disabledClaimCodeId: string;
  let availableClaimCode: string;
  let usedClaimCode: string;
  let reusableCode: string;
  let rewardId: string;
  let pendingRedemptionId: string;
  let deliveredRedemptionId: string;
  let cancelledRedemptionId: string;
  let fixtureSuffix: string;
  const userIds: string[] = [];
  const actionIds: string[] = [];
  const claimCodeIds: string[] = [];
  const rewardIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    const suffix = randomUUID();
    fixtureSuffix = suffix;
    reusableCode = `TASK11-REUSABLE-${suffix}`.toUpperCase();
    availableClaimCode = claimCodeFor(suffix, 1);
    usedClaimCode = claimCodeFor(suffix, 2);

    const users = await Promise.all([
      prisma.user.create({
        data: {
          name: `Task 11 admin ${suffix}`,
          cpf: uniqueCpf(suffix, 1),
          email: `task11-admin-${suffix}@example.test`,
          role: UserRole.ADMIN,
          points: 500,
          xp: 500,
        },
      }),
      prisma.user.create({
        data: {
          name: `Task 11 Alpha ${suffix}`,
          cpf: uniqueCpf(suffix, 2),
          email: `task11-alpha-${suffix}@example.test`,
          points: 500,
          xp: 50,
        },
      }),
      prisma.user.create({
        data: {
          name: `Task 11 Beta ${suffix}`,
          cpf: uniqueCpf(suffix, 3),
          email: `task11-beta-${suffix}@example.test`,
          points: 500,
          xp: 60,
        },
      }),
    ]);
    [admin, firstParticipant, secondParticipant] = users;
    userIds.push(...users.map(({ id }) => id));

    const actions = await Promise.all([
      prisma.action.create({
        data: {
          name: `Task 11 claim ${suffix}`,
          type: ActionType.CHECKIN,
          points: 11,
          isActive: true,
        },
      }),
      prisma.action.create({
        data: {
          name: `Task 11 reusable ${suffix}`,
          type: ActionType.BONUS,
          code: reusableCode,
          points: 13,
          isActive: true,
          isCodeActive: true,
        },
      }),
      prisma.action.create({
        data: {
          name: `Task 11 direct ${suffix}`,
          type: ActionType.DYNAMIC,
          points: 17,
          isActive: true,
        },
      }),
      prisma.action.create({
        data: {
          name: `Task 11 legacy ${suffix}`,
          type: ActionType.QUESTION,
          code: `TASK11-LEGACY-${suffix}`.toUpperCase(),
          points: 19,
          isActive: true,
          isCodeActive: true,
        },
      }),
    ]);
    [claimActionId, reusableActionId, directActionId, legacyActionId] =
      actions.map(({ id }) => id);
    actionIds.push(...actions.map(({ id }) => id));

    const codes = [
      await prisma.claimCode.create({
        data: { code: availableClaimCode, actionId: claimActionId },
      }),
      await prisma.claimCode.create({
        data: {
          code: usedClaimCode,
          actionId: claimActionId,
          isUsed: true,
          isActive: false,
          usedById: secondParticipant.id,
          usedAt: new Date(),
        },
      }),
      await prisma.claimCode.create({
        data: {
          code: claimCodeFor(suffix, 3),
          actionId: claimActionId,
          isActive: false,
        },
      }),
    ];
    [availableClaimCodeId, usedClaimCodeId, disabledClaimCodeId] = codes.map(
      ({ id }) => id,
    );
    claimCodeIds.push(...codes.map(({ id }) => id));

    await prisma.pointEvent.createMany({
      data: [
        {
          userId: secondParticipant.id,
          actionId: claimActionId,
          points: 11,
          kind: PointEventKind.CREDIT,
          source: PointEventSource.ACTION_REDEEM,
          redemptionMethod: ActionRedemptionMethod.CLAIM_CODE,
          claimCodeId: usedClaimCodeId,
          description: 'Task 11 used claim code',
        },
        {
          userId: secondParticipant.id,
          actionId: legacyActionId,
          points: 19,
          kind: PointEventKind.CREDIT,
          source: PointEventSource.ACTION_REDEEM,
          redemptionMethod: ActionRedemptionMethod.LEGACY_UNKNOWN,
          description: 'Task 11 legacy event',
        },
      ],
    });

    const reward = await prisma.reward.create({
      data: {
        name: `Task 11 fixture reward ${suffix}`,
        costInPoints: 25,
        stock: 10,
        isActive: true,
      },
    });
    rewardId = reward.id;
    rewardIds.push(reward.id);
    const redemptions = await Promise.all(
      [
        RedemptionStatus.PENDING,
        RedemptionStatus.DELIVERED,
        RedemptionStatus.CANCELLED,
      ].map((status) =>
        prisma.rewardRedemption.create({
          data: {
            userId: secondParticipant.id,
            rewardId,
            pointsSpent: 25,
            status,
          },
        }),
      ),
    );
    [pendingRedemptionId, deliveredRedemptionId, cancelledRedemptionId] =
      redemptions.map(({ id }) => id);

    adminSession = await login(admin.cpf, admin.email);
    firstSession = await login(firstParticipant.cpf, firstParticipant.email);
    secondSession = await login(secondParticipant.cpf, secondParticipant.email);
  });

  afterAll(async () => {
    try {
      if (!prisma) return;
      await prisma.pointEvent.deleteMany({
        where: {
          OR: [
            { userId: { in: userIds } },
            { actionId: { in: actionIds } },
            { claimCodeId: { in: claimCodeIds } },
          ],
        },
      });
      await prisma.rewardRedemption.deleteMany({
        where: {
          OR: [{ userId: { in: userIds } }, { rewardId: { in: rewardIds } }],
        },
      });
      await prisma.claimCode.deleteMany({
        where: { id: { in: claimCodeIds } },
      });
      await prisma.reward.deleteMany({ where: { id: { in: rewardIds } } });
      await prisma.action.deleteMany({ where: { id: { in: actionIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      if (app) await app.close();
    }
  });

  it('enforces the complete role matrix on admin and player mutations', async () => {
    await get('/admin/dashboard', firstSession).expect(403);
    await get('/admin/participants', firstSession).expect(403);
    await get('/admin/actions', firstSession).expect(403);
    await get('/admin/claim-codes', firstSession).expect(403);
    await get('/admin/rewards', firstSession).expect(403);
    await get('/admin/redemptions', firstSession).expect(403);

    const [userBefore, actionBefore, codeBefore, rewardBefore, pendingBefore] =
      await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: secondParticipant.id } }),
        prisma.action.findUniqueOrThrow({ where: { id: reusableActionId } }),
        prisma.claimCode.findUniqueOrThrow({
          where: { id: disabledClaimCodeId },
        }),
        prisma.reward.findUniqueOrThrow({ where: { id: rewardId } }),
        prisma.rewardRedemption.findUniqueOrThrow({
          where: { id: pendingRedemptionId },
        }),
      ]);
    const forbiddenActionName = `Task 11 forbidden action ${fixtureSuffix}`;
    const forbiddenRewardName = `Task 11 forbidden reward ${fixtureSuffix}`;
    const claimActionCodeCount = await prisma.claimCode.count({
      where: { actionId: claimActionId },
    });

    await patch(
      `/admin/participants/${secondParticipant.id}/status`,
      firstSession,
    )
      .send({ isActive: false })
      .expect(403);
    await post('/actions', firstSession)
      .send({ name: forbiddenActionName, type: 'BONUS', points: 999 })
      .expect(403);
    await patch(`/admin/actions/${reusableActionId}`, firstSession)
      .send({ isActive: false })
      .expect(403);
    await post(
      `/admin/actions/${claimActionId}/claim-codes/generate`,
      firstSession,
    )
      .send({ quantity: 1 })
      .expect(403);
    await patch(
      `/admin/claim-codes/${disabledClaimCodeId}/status`,
      firstSession,
    )
      .send({ isActive: true })
      .expect(403);
    await post('/rewards', firstSession)
      .send({ name: forbiddenRewardName, costInPoints: 1, stock: 1 })
      .expect(403);
    await patch(`/rewards/${rewardId}`, firstSession)
      .send({ stock: 999 })
      .expect(403);
    await patch(
      `/admin/redemptions/${pendingRedemptionId}/deliver`,
      firstSession,
    ).expect(403);
    await patch(
      `/admin/redemptions/${pendingRedemptionId}/cancel`,
      firstSession,
    ).expect(403);

    const [userAfter, actionAfter, codeAfter, rewardAfter, pendingAfter] =
      await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: secondParticipant.id } }),
        prisma.action.findUniqueOrThrow({ where: { id: reusableActionId } }),
        prisma.claimCode.findUniqueOrThrow({
          where: { id: disabledClaimCodeId },
        }),
        prisma.reward.findUniqueOrThrow({ where: { id: rewardId } }),
        prisma.rewardRedemption.findUniqueOrThrow({
          where: { id: pendingRedemptionId },
        }),
      ]);
    expect(userAfter.isActive).toBe(userBefore.isActive);
    expect(actionAfter).toEqual(actionBefore);
    expect(codeAfter).toEqual(codeBefore);
    expect(rewardAfter).toEqual(rewardBefore);
    expect(pendingAfter).toEqual(pendingBefore);
    await expect(
      Promise.all([
        prisma.action.count({ where: { name: forbiddenActionName } }),
        prisma.claimCode.count({ where: { actionId: claimActionId } }),
        prisma.reward.count({ where: { name: forbiddenRewardName } }),
      ]),
    ).resolves.toEqual([0, claimActionCodeCount, 0]);

    await post(`/actions/${directActionId}/redeem`, adminSession).expect(403);
    const availableClaimCodeBefore = await prisma.claimCode.findUniqueOrThrow({
      where: { id: availableClaimCodeId },
    });
    await post('/actions/redeem-code', adminSession)
      .send({ code: availableClaimCode })
      .expect(403);
    const availableClaimCodeAfter = await prisma.claimCode.findUniqueOrThrow({
      where: { id: availableClaimCodeId },
    });
    expect(availableClaimCodeAfter).toEqual(availableClaimCodeBefore);
    expect(availableClaimCodeAfter).toMatchObject({
      isUsed: false,
      isActive: true,
      usedById: null,
      usedAt: null,
    });
    await post(`/rewards/${rewardId}/redeem`, adminSession).expect(403);
  });

  it('reports dashboard totals without counting admin accounts as players', async () => {
    await dashboardMatchingDatabase();
    const [fixtureParticipants, fixturePoints, fixtureCodes, fixtureRewards] =
      await Promise.all([
        prisma.user.count({
          where: { id: { in: userIds }, role: UserRole.PARTICIPANT },
        }),
        prisma.pointEvent.aggregate({
          where: {
            actionId: { in: actionIds },
            source: PointEventSource.ACTION_REDEEM,
          },
          _sum: { points: true },
        }),
        prisma.claimCode.groupBy({
          by: ['isUsed', 'isActive'],
          where: { id: { in: claimCodeIds } },
          _count: { _all: true },
        }),
        prisma.reward.findUniqueOrThrow({ where: { id: rewardId } }),
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

    const adminSearch = await get(
      `/admin/participants?search=${encodeURIComponent(admin.email)}`,
      adminSession,
    ).expect(200);
    expect((adminSearch.body as Page<unknown>).meta.total).toBe(0);
  });

  it('searches and paginates participants, rejects admin details, and invalidates a disabled session', async () => {
    const page = await get(
      `/admin/participants?search=${encodeURIComponent(firstParticipant.email)}&page=1&limit=1`,
      adminSession,
    ).expect(200);
    const body = page.body as Page<{ id: string }>;
    expect(body.items).toEqual([
      expect.objectContaining({ id: firstParticipant.id }),
    ]);
    expect(body.meta).toMatchObject({ page: 1, limit: 1, total: 1 });

    const participantsPage1 = await get(
      `/admin/participants?search=${fixtureSuffix}&page=1&limit=1`,
      adminSession,
    ).expect(200);
    const participantsPage2 = await get(
      `/admin/participants?search=${fixtureSuffix}&page=2&limit=1`,
      adminSession,
    ).expect(200);
    const firstList = participantsPage1.body as Page<{ id: string }>;
    const secondList = participantsPage2.body as Page<{ id: string }>;
    expect(firstList.meta).toEqual({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
    expect(secondList.meta).toEqual({
      page: 2,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
    expect(firstList.items[0].id).not.toBe(secondList.items[0].id);

    const detail = await get(
      `/admin/participants/${secondParticipant.id}`,
      adminSession,
    ).expect(200);
    const participantDetail = detail.body as {
      id: string;
      name: string;
      cpf: string;
      email: string;
      isActive: boolean;
      points: number;
      xp: number;
      level: number;
      counts: {
        actionRedemptions: number;
        claimCodes: number;
        movements: number;
        rewards: Record<string, number>;
      };
      lastLoginAt: string | null;
    };
    expect(participantDetail).toMatchObject({
      id: secondParticipant.id,
      cpf: secondParticipant.cpf,
      email: secondParticipant.email,
      isActive: true,
      points: 500,
      xp: 60,
      level: 1,
      // Jest asymmetric matchers are intentionally untyped in expected objects.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      counts: expect.objectContaining({ movements: 2, actionRedemptions: 2 }),
    });
    expect(participantDetail.name).toBe(`Task 11 Beta ${fixtureSuffix}`);
    expect(typeof participantDetail.lastLoginAt).toBe('string');

    const eventPage1 = await get(
      `/admin/participants/${secondParticipant.id}/point-events?source=action_redeem&page=1&limit=1`,
      adminSession,
    ).expect(200);
    const eventPage2 = await get(
      `/admin/participants/${secondParticipant.id}/point-events?source=action_redeem&page=2&limit=1`,
      adminSession,
    ).expect(200);
    const redemptionPage = await get(
      `/admin/participants/${secondParticipant.id}/reward-redemptions?status=pending&page=1&limit=1`,
      adminSession,
    ).expect(200);
    expect((eventPage1.body as Page<{ id: string }>).meta).toEqual({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
    expect((eventPage2.body as Page<{ id: string }>).meta).toEqual({
      page: 2,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
    expect((eventPage1.body as Page<{ id: string }>).items[0].id).not.toBe(
      (eventPage2.body as Page<{ id: string }>).items[0].id,
    );
    expect((redemptionPage.body as Page<{ id: string }>).meta).toEqual({
      page: 1,
      limit: 1,
      total: 1,
      totalPages: 1,
    });
    expect((redemptionPage.body as Page<{ id: string }>).items[0].id).toBe(
      pendingRedemptionId,
    );

    await get(`/admin/participants/${admin.id}`, adminSession).expect(404);
    await patch(
      `/admin/participants/${firstParticipant.id}/status`,
      adminSession,
    )
      .send({ isActive: false })
      .expect(200)
      .expect(({ body }: Response) =>
        expect((body as { isActive: boolean }).isActive).toBe(false),
      );
    await get('/users/me', firstSession).expect(401);
    await patch(
      `/admin/participants/${firstParticipant.id}/status`,
      adminSession,
    )
      .send({ isActive: true })
      .expect(200);
    firstSession = await login(firstParticipant.cpf, firstParticipant.email);
  });

  it('records exact action redemption methods and exposes independent filtered histories', async () => {
    await post('/actions/redeem-code', firstSession)
      .send({ code: availableClaimCode })
      .expect(201);
    await post('/actions/redeem-code', firstSession)
      .send({ code: reusableCode })
      .expect(201);
    await post(`/actions/${directActionId}/redeem`, firstSession).expect(201);

    const eventsResponse = await get(
      `/admin/participants/${firstParticipant.id}/point-events?source=action_redeem&page=1&limit=2`,
      adminSession,
    ).expect(200);
    const firstPage = eventsResponse.body as Page<{
      redemptionMethod: ActionRedemptionMethod;
      claimCode: { id: string } | null;
      xpDelta: number;
      origin: string;
    }>;
    expect(firstPage.meta).toMatchObject({ page: 1, limit: 2, total: 3 });

    const allEvents = await get(
      `/admin/participants/${firstParticipant.id}/point-events?source=action_redeem&page=1&limit=10`,
      adminSession,
    ).expect(200);
    const events = (
      allEvents.body as Page<{
        redemptionMethod: ActionRedemptionMethod;
        claimCode: { id: string } | null;
        xpDelta: number;
        origin: string;
      }>
    ).items;
    const claimEvent = events.find(
      ({ redemptionMethod }) =>
        redemptionMethod === ActionRedemptionMethod.CLAIM_CODE,
    );
    const reusableEvent = events.find(
      ({ redemptionMethod }) =>
        redemptionMethod === ActionRedemptionMethod.REUSABLE_CODE,
    );
    const directEvent = events.find(
      ({ redemptionMethod }) =>
        redemptionMethod === ActionRedemptionMethod.DIRECT,
    );
    expect(claimEvent).toMatchObject({
      xpDelta: 11,
      origin: 'UNIQUE_CODE',
    });
    expect(claimEvent?.claimCode?.id).toBe(availableClaimCodeId);
    expect(reusableEvent).toMatchObject({
      claimCode: null,
      xpDelta: 13,
      origin: 'REUSABLE_CODE',
    });
    expect(directEvent).toMatchObject({
      claimCode: null,
      xpDelta: 17,
      origin: 'DIRECT_ACTION',
    });

    const redemptions = await get(
      `/admin/participants/${secondParticipant.id}/reward-redemptions?status=pending&page=1&limit=1`,
      adminSession,
    ).expect(200);
    expect(redemptions.body).toMatchObject({
      items: [expect.objectContaining({ id: pendingRedemptionId })],
      meta: { page: 1, limit: 1, total: 1 },
    });
  });

  it('creates, edits and deactivates an action while preserving its redemption snapshot', async () => {
    const originalName = `Task 11 managed action ${randomUUID()}`;
    const created = await post('/actions', adminSession)
      .send({
        name: originalName,
        type: ActionType.BONUS,
        points: 23,
        isActive: true,
      })
      .expect(201);
    const managedActionId = (created.body as { id: string }).id;
    actionIds.push(managedActionId);

    await post(`/actions/${managedActionId}/redeem`, secondSession)
      .expect(201)
      .expect(({ body }: Response) =>
        expect(body).toMatchObject({ awardedPoints: 23 }),
      );
    await patch(`/admin/actions/${managedActionId}`, adminSession)
      .send({ name: `${originalName} edited`, points: 99, isActive: false })
      .expect(200)
      .expect(({ body }: Response) =>
        expect(body).toMatchObject({
          id: managedActionId,
          name: `${originalName} edited`,
          points: 99,
          isActive: false,
        }),
      );

    const event = await prisma.pointEvent.findFirstOrThrow({
      where: { userId: secondParticipant.id, actionId: managedActionId },
    });
    expect(event.points).toBe(23);
    expect(event.redemptionMethod).toBe(ActionRedemptionMethod.DIRECT);
    await post(`/actions/${managedActionId}/redeem`, firstSession).expect(400);

    await patch(`/admin/actions/${reusableActionId}`, adminSession)
      .send({ isActive: false, isCodeActive: true })
      .expect(200)
      .expect(({ body }: Response) =>
        expect(body).toMatchObject({ isActive: false, isCodeActive: true }),
      );
    await patch(`/admin/actions/${reusableActionId}`, adminSession)
      .send({ isActive: true, isCodeActive: false })
      .expect(200)
      .expect(({ body }: Response) =>
        expect(body).toMatchObject({ isActive: true, isCodeActive: false }),
      );
    await patch(`/admin/actions/${reusableActionId}`, adminSession)
      .send({ isCodeActive: true })
      .expect(200);
  });

  it('separates claim-code state and reusable history from legacy events', async () => {
    const generatedAction = await post('/actions', adminSession)
      .send({
        name: `Task 11 generated codes ${randomUUID()}`,
        type: ActionType.CHECKIN,
        points: 7,
      })
      .expect(201);
    const generatedActionId = (generatedAction.body as { id: string }).id;
    actionIds.push(generatedActionId);
    const generatedResponse = await post(
      `/admin/actions/${generatedActionId}/claim-codes/generate`,
      adminSession,
    )
      .send({ quantity: 2 })
      .expect(201);
    const generatedCodes = (generatedResponse.body as { codes: string[] })
      .codes;
    expect(generatedCodes).toHaveLength(2);
    const generatedRows = await prisma.claimCode.findMany({
      where: { code: { in: generatedCodes } },
      orderBy: { code: 'asc' },
    });
    expect(generatedRows).toHaveLength(2);
    claimCodeIds.push(...generatedRows.map(({ id }) => id));

    const toggledId = generatedRows[0].id;
    await patch(`/admin/claim-codes/${toggledId}/status`, adminSession)
      .send({ isActive: false })
      .expect(200)
      .expect(({ body }: Response) =>
        expect(body).toMatchObject({ id: toggledId, status: 'DISABLED' }),
      );
    const disabledFilter = await get(
      `/admin/claim-codes?actionId=${generatedActionId}&status=disabled&page=1&limit=20`,
      adminSession,
    ).expect(200);
    expect(
      (disabledFilter.body as Page<{ id: string }>).items.map(({ id }) => id),
    ).toEqual([toggledId]);
    await patch(`/admin/claim-codes/${toggledId}/status`, adminSession)
      .send({ isActive: true })
      .expect(200)
      .expect(({ body }: Response) =>
        expect(body).toMatchObject({ id: toggledId, status: 'AVAILABLE' }),
      );

    await post('/actions/redeem-code', secondSession)
      .send({ code: generatedRows[1].code })
      .expect(201);
    const usedFilter = await get(
      `/admin/claim-codes?actionId=${generatedActionId}&status=used&page=1&limit=20`,
      adminSession,
    ).expect(200);
    const newlyUsed = (
      usedFilter.body as Page<{
        id: string;
        usedAt: string | null;
        usedBy: { id: string } | null;
        status: string;
      }>
    ).items.find(({ id }) => id === generatedRows[1].id);
    expect(newlyUsed).toMatchObject({
      id: generatedRows[1].id,
      status: 'USED',
      usedBy: { id: secondParticipant.id },
    });
    expect(typeof newlyUsed?.usedAt).toBe('string');
    await patch(
      `/admin/claim-codes/${generatedRows[1].id}/status`,
      adminSession,
    )
      .send({ isActive: true })
      .expect(409);

    const claimCodesResponse = await get(
      `/admin/claim-codes?actionId=${claimActionId}&page=1&limit=10`,
      adminSession,
    ).expect(200);
    const claimCodes = claimCodesResponse.body as Page<{
      id: string;
      isActive: boolean;
      status: string;
      usedBy: { id: string } | null;
    }>;
    const redeemedCode = claimCodes.items.find(
      ({ id }) => id === availableClaimCodeId,
    );
    const disabledCode = claimCodes.items.find(
      ({ id }) => id === disabledClaimCodeId,
    );
    expect(redeemedCode).toMatchObject({ isActive: false, status: 'USED' });
    expect(redeemedCode?.usedBy?.id).toBe(firstParticipant.id);
    expect(disabledCode).toMatchObject({ status: 'DISABLED' });
    await patch(
      `/admin/claim-codes/${availableClaimCodeId}/status`,
      adminSession,
    )
      .send({ isActive: true })
      .expect(409);

    const reusable = await get(
      `/admin/reusable-codes?search=${encodeURIComponent('Task 11')}&page=1&limit=20`,
      adminSession,
    ).expect(200);
    const reusablePage = reusable.body as Page<{
      id: string;
      totalUses: number;
    }>;
    const reusableItems = reusablePage.items;
    expect(
      reusableItems.find(({ id }) => id === reusableActionId)?.totalUses,
    ).toBe(1);
    expect(
      reusableItems.find(({ id }) => id === legacyActionId)?.totalUses,
    ).toBe(0);

    const history = await get(
      `/admin/reusable-codes/${reusableActionId}/redemptions?page=1&limit=1`,
      adminSession,
    ).expect(200);
    const reusableHistory = history.body as Page<{
      points: number;
      participant: { id: string };
    }>;
    expect(reusableHistory.meta.total).toBe(1);
    expect(reusableHistory.items).toHaveLength(1);
    expect(reusableHistory.items[0]).toMatchObject({ points: 13 });
    expect(reusableHistory.items[0].participant.id).toBe(firstParticipant.id);

    await patch(`/admin/actions/${reusableActionId}`, adminSession)
      .send({ isCodeActive: false })
      .expect(200);
    await post('/actions/redeem-code', secondSession)
      .send({ code: reusableCode })
      .expect(400);
    await patch(`/admin/actions/${reusableActionId}`, adminSession)
      .send({ isCodeActive: true })
      .expect(200);
  });

  it('creates, edits, hides, and preserves inactive rewards for admins', async () => {
    const suffix = randomUUID();
    const created = await post('/rewards', adminSession)
      .send({
        name: `Task 11 managed reward ${suffix}`,
        costInPoints: 40,
        stock: 3,
        isActive: true,
      })
      .expect(201);
    const managedRewardId = (created.body as { id: string }).id;
    rewardIds.push(managedRewardId);

    await patch(`/rewards/${managedRewardId}`, adminSession)
      .send({ costInPoints: 45, stock: 4, isActive: false })
      .expect(200)
      .expect(({ body }: Response) =>
        expect(body).toMatchObject({
          id: managedRewardId,
          costInPoints: 45,
          stock: 4,
          isActive: false,
        }),
      );

    const catalog = await get('/rewards', firstSession).expect(200);
    expect(catalog.body as Array<{ id: string }>).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: managedRewardId }),
      ]),
    );
    const history = await get(
      `/admin/rewards?search=${encodeURIComponent(suffix)}&status=inactive&page=1&limit=1`,
      adminSession,
    ).expect(200);
    expect(history.body as Page<unknown>).toMatchObject({
      items: [expect.objectContaining({ id: managedRewardId })],
      meta: { total: 1 },
    });
  });

  it('runs real redeem/cancel and redeem/deliver cycles with exact balances and terminal statuses', async () => {
    const created = await post('/rewards', adminSession)
      .send({
        name: `Task 11 transactional reward ${randomUUID()}`,
        costInPoints: 40,
        stock: 2,
        isActive: true,
      })
      .expect(201);
    const transactionalRewardId = (created.body as { id: string }).id;
    rewardIds.push(transactionalRewardId);
    const participantBefore = await prisma.user.findUniqueOrThrow({
      where: { id: firstParticipant.id },
    });

    const cancellableResponse = await post(
      `/rewards/${transactionalRewardId}/redeem`,
      firstSession,
    )
      .expect(201)
      .expect(({ body }: Response) =>
        expect(body).toMatchObject({
          pointsSpent: 40,
          status: RedemptionStatus.PENDING,
        }),
      );
    const cancellableId = (cancellableResponse.body as { id: string }).id;
    const [afterRedeem, rewardAfterRedeem] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: firstParticipant.id } }),
      prisma.reward.findUniqueOrThrow({ where: { id: transactionalRewardId } }),
    ]);
    expect(afterRedeem.points).toBe(participantBefore.points - 40);
    expect(afterRedeem.xp).toBe(participantBefore.xp);
    expect(rewardAfterRedeem.stock).toBe(1);

    await patch(`/admin/redemptions/${cancellableId}/cancel`, adminSession)
      .expect(200)
      .expect(({ body }: Response) =>
        expect(body).toMatchObject({ status: RedemptionStatus.CANCELLED }),
      );
    const [afterCancel, rewardAfterCancel, cancelled] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: firstParticipant.id } }),
      prisma.reward.findUniqueOrThrow({ where: { id: transactionalRewardId } }),
      prisma.rewardRedemption.findUniqueOrThrow({
        where: { id: cancellableId },
      }),
    ]);
    expect(afterCancel.points).toBe(participantBefore.points);
    expect(afterCancel.xp).toBe(participantBefore.xp);
    expect(rewardAfterCancel.stock).toBe(2);
    expect(cancelled.status).toBe(RedemptionStatus.CANCELLED);
    await patch(
      `/admin/redemptions/${cancellableId}/cancel`,
      adminSession,
    ).expect(400);
    await patch(
      `/admin/redemptions/${cancellableId}/deliver`,
      adminSession,
    ).expect(400);

    const deliverableResponse = await post(
      `/rewards/${transactionalRewardId}/redeem`,
      firstSession,
    ).expect(201);
    const deliverableId = (deliverableResponse.body as { id: string }).id;
    await patch(`/admin/redemptions/${deliverableId}/deliver`, adminSession)
      .expect(200)
      .expect(({ body }: Response) =>
        expect(body).toMatchObject({ status: RedemptionStatus.DELIVERED }),
      );
    const delivered = await prisma.rewardRedemption.findUniqueOrThrow({
      where: { id: deliverableId },
    });
    expect(delivered.status).toBe(RedemptionStatus.DELIVERED);
    await patch(
      `/admin/redemptions/${deliverableId}/deliver`,
      adminSession,
    ).expect(400);
    await patch(
      `/admin/redemptions/${deliverableId}/cancel`,
      adminSession,
    ).expect(400);

    const originalCancelled = await prisma.rewardRedemption.findUniqueOrThrow({
      where: { id: cancelledRedemptionId },
    });
    const originalDelivered = await prisma.rewardRedemption.findUniqueOrThrow({
      where: { id: deliveredRedemptionId },
    });
    expect(originalCancelled.status).toBe(RedemptionStatus.CANCELLED);
    expect(originalDelivered.status).toBe(RedemptionStatus.DELIVERED);
  });

  function get(path: string, session: AuthSession) {
    return request(app.getHttpServer()).get(path).set('Cookie', session.cookie);
  }

  function post(path: string, session: AuthSession) {
    return request(app.getHttpServer())
      .post(path)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrfToken);
  }

  function patch(path: string, session: AuthSession) {
    return request(app.getHttpServer())
      .patch(path)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrfToken);
  }

  async function login(cpf: string, email: string): Promise<AuthSession> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ cpf, email })
      .expect(200);
    const setCookie = response.headers['set-cookie'] as string[] | undefined;
    if (!Array.isArray(setCookie) || !setCookie[0]) {
      throw new Error('Login did not return an access token cookie.');
    }
    return {
      cookie: setCookie[0].split(';')[0],
      csrfToken: (response.body as LoginBody).csrfToken,
    };
  }

  async function dashboardMatchingDatabase(): Promise<Dashboard> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await get('/admin/dashboard', adminSession).expect(200);
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
        prisma.user.count({ where: { role: UserRole.PARTICIPANT } }),
        prisma.user.count({
          where: { role: UserRole.PARTICIPANT, isActive: true },
        }),
        prisma.user.count({
          where: { role: UserRole.PARTICIPANT, isActive: false },
        }),
        prisma.pointEvent.aggregate({
          where: {
            source: PointEventSource.ACTION_REDEEM,
            user: { role: UserRole.PARTICIPANT },
          },
          _count: { _all: true },
          _sum: { points: true },
        }),
        prisma.claimCode.count(),
        prisma.claimCode.count({ where: { isUsed: true } }),
        prisma.claimCode.count({
          where: { isUsed: false, isActive: true, action: { isActive: true } },
        }),
        prisma.action.count({ where: { code: { not: null } } }),
        prisma.action.count({
          where: { code: { not: null }, isActive: true, isCodeActive: true },
        }),
        prisma.reward.count(),
        prisma.reward.count({ where: { isActive: true } }),
        prisma.reward.count({ where: { stock: 0, isActive: true } }),
        prisma.rewardRedemption.count({
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

function uniqueCpf(suffix: string, discriminator: number) {
  const digits = suffix.replace(/\D/g, '').padEnd(10, '0').slice(0, 10);
  return `${digits}${discriminator}`;
}

function claimCodeFor(suffix: string, discriminator: number) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const source = `${discriminator}${suffix}`.replace(/-/g, '').toUpperCase();
  const encoded = Array.from({ length: 8 }, (_, index) =>
    alphabet.charAt(source.charCodeAt(index % source.length) % alphabet.length),
  ).join('');
  return `${encoded.slice(0, 4)}-${encoded.slice(4)}`;
}
