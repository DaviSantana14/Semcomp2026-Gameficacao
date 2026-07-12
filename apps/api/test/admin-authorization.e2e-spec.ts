import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ActionType, UserRole } from '@prisma/client';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
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

  it('returns 403 when a participant attempts an admin route', async () => {
    await request(app.getHttpServer())
      .post('/actions')
      .set('Cookie', participantSession.cookie)
      .set('X-CSRF-Token', participantSession.csrfToken)
      .send({
        name: 'Unauthorized action',
        type: ActionType.DYNAMIC,
        points: 1,
      })
      .expect(403);
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
