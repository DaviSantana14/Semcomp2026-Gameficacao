import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ActionType } from '@prisma/client';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { generateClaimCode } from '../src/common/event-code';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  assertDisposableTestDatabase,
  hasDisposableTestDatabaseConfiguration,
  truncateDisposableTestDatabase,
} from './support/e2e-database-cleanup';
import {
  AuthSession,
  createE2eAdmin,
  createE2eParticipant,
  E2E_ADMIN_PASSWORD,
  loginForE2e,
} from './support/admin-e2e-harness';

const describeDisposable = hasDisposableTestDatabaseConfiguration()
  ? describe
  : describe.skip;

type RankingBody = {
  ranking: Array<{ name: string }>;
  me: { name: string } | null;
};

describeDisposable('Player flow authorization matrix (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminSession: AuthSession;
  let participantSession: AuthSession;
  let participantId: string;
  let directActionId: string;
  let codedActionId: string;
  let rewardId: string;
  let claimCodeId: string | undefined;
  let pendingRedemptionId: string | undefined;
  let reusableCode: string;

  beforeAll(async () => {
    assertDisposableTestDatabase();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    const suffix = randomUUID();
    reusableCode = `TASK2-${suffix}`.toUpperCase();
    const [admin, participant] = await Promise.all([
      createE2eAdmin(prisma, {
        name: 'Task 2 admin',
        cpf: uniqueCpf(suffix, 1),
        email: `task2-admin-${suffix}@example.test`,
        adminProfile: 'GENERAL',
        isActive: true,
        password: E2E_ADMIN_PASSWORD,
      }),
      createE2eParticipant(prisma, {
        name: 'Task 2 participant',
        cpf: uniqueCpf(suffix, 2),
        email: `task2-participant-${suffix}@example.test`,
        isActive: true,
        password: 'Task-2-Participant-2026!',
      }),
    ]);
    await prisma.user.update({
      where: { id: admin.id },
      data: { points: 100, xp: 100 },
    });
    await prisma.user.update({
      where: { id: participant.id },
      data: { points: 100, xp: 100 },
    });
    participantId = participant.id;

    const [directAction, codedAction, reward] = await Promise.all([
      prisma.action.create({
        data: {
          name: `Task 2 direct ${suffix}`,
          type: ActionType.DYNAMIC,
          points: 10,
          isActive: true,
        },
      }),
      prisma.action.create({
        data: {
          name: `Task 2 coded ${suffix}`,
          type: ActionType.DYNAMIC,
          code: reusableCode,
          points: 10,
          isActive: true,
          isCodeActive: true,
        },
      }),
      prisma.reward.create({
        data: {
          name: `Task 2 reward ${suffix}`,
          costInPoints: 10,
          stock: 1,
          isActive: true,
        },
      }),
    ]);
    directActionId = directAction.id;
    codedActionId = codedAction.id;
    rewardId = reward.id;

    const [claimCode, pendingRedemption] = await Promise.all([
      prisma.claimCode.create({
        data: {
          code: generateClaimCode(),
          actionId: directAction.id,
        },
      }),
      prisma.rewardRedemption.create({
        data: {
          userId: participant.id,
          rewardId: reward.id,
          pointsSpent: reward.costInPoints,
        },
      }),
    ]);
    claimCodeId = claimCode.id;
    pendingRedemptionId = pendingRedemption.id;

    adminSession = await loginForE2e(
      app,
      prisma,
      admin.cpf,
      admin.email,
      E2E_ADMIN_PASSWORD,
    );
    participantSession = await loginForE2e(
      app,
      prisma,
      participant.cpf,
      participant.email,
      'Task-2-Participant-2026!',
    );
  });

  afterAll(async () => {
    try {
      await truncateDisposableTestDatabase(prisma);
    } finally {
      if (app) await app.close();
      if (prisma) await prisma.$disconnect();
    }
  });

  it.each([
    [
      'direct action redemption',
      () => postAsAdmin(`/actions/${directActionId}/redeem`),
    ],
    [
      'code action redemption',
      () => postAsAdmin('/actions/redeem-code').send({ code: reusableCode }),
    ],
    ['reward redemption', () => postAsAdmin(`/rewards/${rewardId}/redeem`)],
  ])('returns 403 when an admin attempts %s', async (_name, makeRequest) => {
    await makeRequest().expect(403);
  });

  it.each([
    ['reward catalog', () => '/rewards'],
    ['reward detail', () => `/rewards/${rewardId}`],
  ])('restricts %s to participants', async (_name, makePath) => {
    const path = makePath();
    await request(app.getHttpServer())
      .get(path)
      .set('Cookie', adminSession.cookie)
      .expect(403);
    await request(app.getHttpServer())
      .get(path)
      .set('Cookie', participantSession.cookie)
      .expect(200);
  });

  it.each([
    '/admin/dashboard',
    '/admin/participants',
    '/admin/actions',
    '/admin/claim-codes',
    '/admin/rewards',
    '/admin/redemptions',
  ])('returns 403 when a participant accesses %s', async (path) => {
    await request(app.getHttpServer())
      .get(path)
      .set('Cookie', participantSession.cookie)
      .expect(403);
  });

  it('rejects participant admin mutations without changing persisted state', async () => {
    if (!claimCodeId || !pendingRedemptionId) {
      throw new Error('Authorization fixtures were not initialized.');
    }
    const before = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: participantId } }),
      prisma.action.findUniqueOrThrow({ where: { id: codedActionId } }),
      prisma.claimCode.findUniqueOrThrow({ where: { id: claimCodeId } }),
      prisma.reward.findUniqueOrThrow({ where: { id: rewardId } }),
      prisma.rewardRedemption.findUniqueOrThrow({
        where: { id: pendingRedemptionId },
      }),
    ]);

    await postAsParticipant('/actions')
      .send({
        name: 'Unauthorized action',
        type: ActionType.DYNAMIC,
        points: 1,
      })
      .expect(403);
    await patchAsParticipant(`/admin/actions/${codedActionId}`)
      .send({ points: 999 })
      .expect(403);
    await patchAsParticipant(`/admin/participants/${participantId}/status`)
      .send({ isActive: false })
      .expect(403);
    await postAsParticipant(
      `/admin/actions/${directActionId}/claim-codes/generate`,
    )
      .send({ quantity: 1 })
      .expect(403);
    await patchAsParticipant(`/admin/claim-codes/${claimCodeId}/status`)
      .send({ isActive: false })
      .expect(403);
    await postAsParticipant('/rewards')
      .send({
        name: 'Unauthorized reward',
        costInPoints: 1,
        stock: 1,
        isActive: true,
      })
      .expect(403);
    await patchAsParticipant(`/rewards/${rewardId}`)
      .send({ stock: 999 })
      .expect(403);
    await patchAsParticipant(
      `/admin/redemptions/${pendingRedemptionId}/cancel`,
    ).expect(403);
    await patchAsParticipant(
      `/admin/redemptions/${pendingRedemptionId}/deliver`,
    ).expect(403);

    const after = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: participantId } }),
      prisma.action.findUniqueOrThrow({ where: { id: codedActionId } }),
      prisma.claimCode.findUniqueOrThrow({ where: { id: claimCodeId } }),
      prisma.reward.findUniqueOrThrow({ where: { id: rewardId } }),
      prisma.rewardRedemption.findUniqueOrThrow({
        where: { id: pendingRedemptionId },
      }),
    ]);
    expect(after).toEqual(before);
    expect(
      await prisma.action.count({ where: { name: 'Unauthorized action' } }),
    ).toBe(0);
    expect(
      await prisma.reward.count({ where: { name: 'Unauthorized reward' } }),
    ).toBe(0);
  });

  it.each([
    ['admin', () => getRanking(adminSession), null],
    ['participant', () => getRanking(participantSession), 'Task 2 participant'],
  ])(
    'keeps ranking available to the %s',
    async (_role, makeRequest, meName) => {
      const response = await makeRequest().expect(200);

      const body = response.body as RankingBody;

      expect(body.me?.name ?? null).toBe(meName);
      expect(body.ranking).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Task 2 admin' }),
        ]),
      );
    },
  );

  function postAsAdmin(path: string) {
    return request(app.getHttpServer())
      .post(path)
      .set('Cookie', adminSession.cookie)
      .set('X-CSRF-Token', adminSession.csrfToken);
  }

  function postAsParticipant(path: string) {
    return request(app.getHttpServer())
      .post(path)
      .set('Cookie', participantSession.cookie)
      .set('X-CSRF-Token', participantSession.csrfToken);
  }

  function patchAsParticipant(path: string) {
    return request(app.getHttpServer())
      .patch(path)
      .set('Cookie', participantSession.cookie)
      .set('X-CSRF-Token', participantSession.csrfToken);
  }

  function getRanking(session: AuthSession) {
    return request(app.getHttpServer())
      .get('/ranking')
      .set('Cookie', session.cookie);
  }
});

function uniqueCpf(suffix: string, discriminator: number) {
  const digits = suffix.replace(/\D/g, '').padEnd(10, '0').slice(0, 10);

  return `${digits}${discriminator}`;
}
