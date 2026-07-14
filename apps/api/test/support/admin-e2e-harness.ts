import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  assertDisposableTestDatabase,
  truncateDisposableTestDatabase,
} from './e2e-database-cleanup';

export type AuthSession = { cookie: string; csrfToken: string };

type LoginBody = { csrfToken: string };

export class AdminE2eHarness {
  private constructor(
    readonly app: INestApplication<App>,
    readonly prisma: PrismaService,
  ) {}

  static async create(): Promise<AdminE2eHarness> {
    assertDisposableTestDatabase();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app: INestApplication<App> = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    return new AdminE2eHarness(app, moduleFixture.get(PrismaService));
  }

  async login(cpf: string, email: string): Promise<AuthSession> {
    const response = await request(this.app.getHttpServer())
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

  get(path: string, session: AuthSession) {
    return request(this.app.getHttpServer())
      .get(path)
      .set('Cookie', session.cookie);
  }

  post(path: string, session: AuthSession) {
    return request(this.app.getHttpServer())
      .post(path)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrfToken);
  }

  patch(path: string, session: AuthSession) {
    return request(this.app.getHttpServer())
      .patch(path)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrfToken);
  }

  uniqueCpf(suffix: string, discriminator: number): string {
    const digits = suffix.replace(/\D/g, '').padEnd(10, '0').slice(0, 10);
    return `${digits}${discriminator}`;
  }

  async close(): Promise<void> {
    try {
      await truncateDisposableTestDatabase(this.prisma);
    } finally {
      await this.app.close();
    }
  }
}
