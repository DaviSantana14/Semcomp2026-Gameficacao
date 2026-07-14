import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ActionType, UserRole } from '@prisma/client';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { generateClaimCode } from '../src/common/event-code';
import { PrismaService } from '../src/prisma/prisma.service';

type AuthSession = {
  cookie: string;
  csrfToken: string;
};

type LoginBody = {
  csrfToken: string;
};

type RankingBody = {
  ranking: Array<{ name: string }>;
  me: { name: string } | null;
};

describe('Player flow authorization matrix (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminSession: AuthSession;
  let participantSession: AuthSession;
  let adminId: string;
  let participantId: string;
  let directActionId: string;
  let codedActionId: string;
  let rewardId: string;
  let claimCodeId: string | undefined;
  let pendingRedemptionId: string | undefined;
  let reusableCode: string;

  beforeAll(async () => {
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
      prisma.user.create({
        data: {
          name: 'Task 2 admin',
          cpf: uniqueCpf(suffix, 1),
          email: `task2-admin-${suffix}@example.test`,
          role: UserRole.ADMIN,
          points: 100,
          xp: 100,
        },
      }),
      prisma.user.create({
        data: {
          name: 'Task 2 participant',
          cpf: uniqueCpf(suffix, 2),
          email: `task2-participant-${suffix}@example.test`,
          role: UserRole.PARTICIPANT,
          points: 100,
          xp: 100,
        },
      }),
    ]);
    adminId = admin.id;
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

    adminSession = await login(admin.cpf, admin.email);
    participantSession = await login(participant.cpf, participant.email);
  });

  afterAll(async () => {
    await prisma.pointEvent.deleteMany({
      where: { userId: { in: [adminId, participantId] } },
    });
    await prisma.rewardRedemption.deleteMany({
      where: { userId: { in: [adminId, participantId] } },
    });
    if (claimCodeId) {
      await prisma.claimCode.deleteMany({ where: { id: claimCodeId } });
    }
    await prisma.reward.deleteMany({ where: { id: rewardId } });
    await prisma.action.deleteMany({
      where: { id: { in: [directActionId, codedActionId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [adminId, participantId] } },
    });
    await app.close();
    await prisma.$disconnect();
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

  async function login(cpf: string, email: string): Promise<AuthSession> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ cpf, email })
      .expect(200);
    const setCookie = response.headers['set-cookie'] as string[] | undefined;
    const body = response.body as LoginBody;

    if (!Array.isArray(setCookie) || !setCookie[0]) {
      throw new Error('Login did not return an access token cookie.');
    }

    return {
      cookie: setCookie[0].split(';')[0],
      csrfToken: body.csrfToken,
    };
  }
});

function uniqueCpf(suffix: string, discriminator: number) {
  const digits = suffix.replace(/\D/g, '').padEnd(10, '0').slice(0, 10);

  return `${digits}${discriminator}`;
}
