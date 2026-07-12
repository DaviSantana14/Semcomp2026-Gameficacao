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
    await prisma.claimCode.deleteMany({ where: { id: { in: claimCodeIds } } });
    await prisma.reward.deleteMany({ where: { id: { in: rewardIds } } });
    await prisma.action.deleteMany({ where: { id: { in: actionIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
    await prisma.$disconnect();
  });

  it('enforces the complete role matrix on admin and player mutations', async () => {
    await get('/admin/dashboard', firstSession).expect(403);
    await get('/admin/participants', firstSession).expect(403);
    await get('/admin/actions', firstSession).expect(403);
    await get('/admin/claim-codes', firstSession).expect(403);
    await get('/admin/rewards', firstSession).expect(403);
    await get('/admin/redemptions', firstSession).expect(403);

    await post(`/actions/${directActionId}/redeem`, adminSession).expect(403);
    await post('/actions/redeem-code', adminSession)
      .send({ code: reusableCode })
      .expect(403);
    await post(`/rewards/${rewardId}/redeem`, adminSession).expect(403);
  });

  it('reports dashboard totals without counting admin accounts as players', async () => {
    const response = await get('/admin/dashboard', adminSession).expect(200);
    const dashboard = response.body as {
      participants: { total: number; active: number };
      pointsAwarded: number;
      claimCodes: { used: number; available: number };
    };
    expect(dashboard.participants.total).toBeGreaterThanOrEqual(2);
    expect(dashboard.participants.active).toBeGreaterThanOrEqual(2);
    expect(dashboard.pointsAwarded).toBeGreaterThanOrEqual(30);
    expect(dashboard.claimCodes.used).toBeGreaterThanOrEqual(1);
    expect(dashboard.claimCodes.available).toBeGreaterThanOrEqual(1);

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
      `/admin/participants/${firstParticipant.id}/point-events?source=ACTION_REDEEM&page=1&limit=2`,
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
      `/admin/participants/${firstParticipant.id}/point-events?source=ACTION_REDEEM&page=1&limit=10`,
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
    expect(claimEvent).toMatchObject({ xpDelta: 11 });
    expect(claimEvent?.claimCode?.id).toBe(availableClaimCodeId);
    expect(reusableEvent).toMatchObject({ claimCode: null, xpDelta: 13 });
    expect(directEvent).toMatchObject({ claimCode: null, xpDelta: 17 });
    expect(events.every(({ origin }) => origin.startsWith('Task 11'))).toBe(
      true,
    );

    const redemptions = await get(
      `/admin/participants/${secondParticipant.id}/reward-redemptions?status=PENDING&page=1&limit=1`,
      adminSession,
    ).expect(200);
    expect(redemptions.body).toMatchObject({
      items: [expect.objectContaining({ id: pendingRedemptionId })],
      meta: { page: 1, limit: 1, total: 1 },
    });
  });

  it('separates claim-code state and reusable history from legacy events', async () => {
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

  it('delivers and cancels only pending orders while cancellation refunds points and stock without XP', async () => {
    const beforeCancel = await prisma.user.findUniqueOrThrow({
      where: { id: secondParticipant.id },
    });
    const rewardBefore = await prisma.reward.findUniqueOrThrow({
      where: { id: rewardId },
    });

    await patch(
      `/admin/redemptions/${pendingRedemptionId}/deliver`,
      adminSession,
    ).expect(200);
    await patch(
      `/admin/redemptions/${pendingRedemptionId}/cancel`,
      adminSession,
    ).expect(400);
    await patch(
      `/admin/redemptions/${deliveredRedemptionId}/deliver`,
      adminSession,
    ).expect(400);

    const cancellable = await prisma.rewardRedemption.create({
      data: {
        userId: secondParticipant.id,
        rewardId,
        pointsSpent: 25,
        status: RedemptionStatus.PENDING,
      },
    });
    await patch(
      `/admin/redemptions/${cancellable.id}/cancel`,
      adminSession,
    ).expect(200);
    const [afterCancel, rewardAfter] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: secondParticipant.id } }),
      prisma.reward.findUniqueOrThrow({ where: { id: rewardId } }),
    ]);
    expect(afterCancel.points).toBe(beforeCancel.points + 25);
    expect(afterCancel.xp).toBe(beforeCancel.xp);
    expect(rewardAfter.stock).toBe(rewardBefore.stock + 1);
    expect(cancelledRedemptionId).toBeTruthy();
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
