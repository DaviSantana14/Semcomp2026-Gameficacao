import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  assertDisposableTestDatabase,
  truncateDisposableTestDatabase,
} from './support/e2e-database-cleanup';

const origin = process.env.FRONTEND_URL ?? 'http://localhost:3000';

describe('Authentication (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    assertDisposableTestDatabase();
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
    prisma = app.get(PrismaService);
    await truncateDisposableTestDatabase(prisma);
  });

  afterAll(async () => {
    if (!app || !prisma) {
      return;
    }
    try {
      await truncateDisposableTestDatabase(prisma);
    } finally {
      await app.close();
    }
  });

  it('authenticates a new participant in one register request', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .set('Origin', origin)
      .send({
        name: 'Ada Lovelace',
        cpf: '52998224725',
        email: 'ada@example.com',
        password: 'senha livre 2026',
      })
      .expect(201);

    expect(response.headers['set-cookie']).toBeDefined();
    const body = response.body as {
      csrfToken: string;
      user: { email: string; role: string };
    };
    expect(typeof body.csrfToken).toBe('string');
    expect(body.csrfToken.length).toBeGreaterThan(0);
    expect(body.user).toMatchObject({
      email: 'ada@example.com',
      role: 'PARTICIPANT',
    });
    expect(body.user).not.toHaveProperty('passwordHash');
  });

  it('rejects the legacy CPF-based participant login with 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', origin)
      .send({
        cpf: '52998224725',
        email: 'ada@example.com',
        password: 'senha livre 2026',
      })
      .expect(400);

    expect(response.body).toMatchObject({ statusCode: 400 });
  });

  it('returns one generic 401 for any unknown or wrong participant login', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', origin)
      .send({ email: 'ghost@example.com', password: 'wrong-password' })
      .expect(401);

    expect(response.body).toEqual({
      statusCode: 401,
      message: 'Email ou senha inválidos.',
      error: 'Unauthorized',
    });
  });

  it('protects the heartbeat behind JWT, CSRF and origin', async () => {
    const session = await registerParticipantSession(
      'Bea Lovelace',
      '71428758861',
      'bea@example.com',
    );

    await request(app.getHttpServer()).post('/auth/heartbeat').expect(401);

    await request(app.getHttpServer())
      .post('/auth/heartbeat')
      .set('Cookie', session.cookie)
      .expect(403);

    const heartbeat = await request(app.getHttpServer())
      .post('/auth/heartbeat')
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrfToken)
      .set('Origin', origin)
      .expect(204);

    expect(heartbeat.body).toEqual({});
  });

  it('invalidates JWT reuse after logout', async () => {
    const session = await registerParticipantSession(
      'Carlos Lovelace',
      '86217086501',
      'carlos@example.com',
    );

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrfToken)
      .set('Origin', origin)
      .expect(204);

    await request(app.getHttpServer())
      .get('/auth/csrf')
      .set('Cookie', session.cookie)
      .expect(401);
  });

  async function registerParticipantSession(
    name: string,
    cpf: string,
    email: string,
  ): Promise<{ cookie: string; csrfToken: string }> {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .set('Origin', origin)
      .send({ name, cpf, email, password: 'senha livre 2026' })
      .expect(201);

    return {
      cookie: (response.headers['set-cookie'] as string[])[0].split(';')[0],
      csrfToken: (response.body as { csrfToken: string }).csrfToken,
    };
  }
});
