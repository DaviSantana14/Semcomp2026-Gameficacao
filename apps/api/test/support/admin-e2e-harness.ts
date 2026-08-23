import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AdminProfile } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { AuditService } from '../../src/audit/audit.service';
import { AdminReconciliationRepository } from '../../src/admin/admin-reconciliation.repository';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  assertDisposableTestDatabase,
  truncateDisposableTestDatabase,
} from './e2e-database-cleanup';

export type AuthSession = { cookie: string; csrfToken: string };

type LoginBody = { csrfToken: string };

export const E2E_ADMIN_PASSWORD = 'Semcomp-E2e-Admin-2026!';
export const E2E_PARTICIPANT_PASSWORD = 'Semcomp-E2e-Participante-2026!';

export type E2eAdminFixtureInput = {
  name: string;
  cpf: string;
  email: string;
  adminProfile: AdminProfile;
  isActive: boolean;
  password: string | null;
};

export type E2eAdminFixture = {
  id: string;
  name: string;
  cpf: string;
  email: string;
  adminProfile: AdminProfile;
  isActive: boolean;
  password: string | null;
};

export type E2eParticipantFixtureInput = {
  name: string;
  cpf: string;
  email: string;
  isActive: boolean;
  password: string;
};

export type E2eParticipantFixture = {
  id: string;
  name: string;
  cpf: string;
  email: string;
  isActive: boolean;
  password: string;
};

const e2eOrigin = () => process.env.FRONTEND_URL ?? 'http://localhost:3000';

export async function createE2eAdmin(
  prisma: PrismaService,
  input: E2eAdminFixtureInput,
): Promise<E2eAdminFixture> {
  const created = await prisma.user.create({
    data: {
      name: input.name,
      cpf: input.cpf,
      email: input.email,
      role: 'ADMIN',
      adminProfile: input.adminProfile,
      isActive: input.isActive,
      passwordHash:
        input.password === null ? null : await hash(input.password, 12),
      passwordResetRequired: false,
      passwordResetExpiresAt: null,
    },
    select: {
      id: true,
      name: true,
      cpf: true,
      email: true,
      adminProfile: true,
      isActive: true,
    },
  });

  return {
    ...created,
    adminProfile: created.adminProfile!,
    password: input.password,
  };
}

export async function createE2eParticipant(
  prisma: PrismaService,
  input: E2eParticipantFixtureInput,
): Promise<E2eParticipantFixture> {
  const created = await prisma.user.create({
    data: {
      name: input.name,
      cpf: input.cpf,
      email: input.email,
      role: 'PARTICIPANT',
      isActive: input.isActive,
      passwordHash: await hash(input.password, 12),
      passwordResetRequired: false,
      passwordResetExpiresAt: null,
    },
    select: {
      id: true,
      name: true,
      cpf: true,
      email: true,
      isActive: true,
    },
  });

  return { ...created, password: input.password };
}

export function activateAdminForE2e(
  app: INestApplication<App>,
  input: {
    code: string;
    cpf: string;
    email: string;
    password: string;
    passwordConfirmation?: string;
  },
) {
  return request(app.getHttpServer())
    .post('/auth/admin/activate')
    .set('Origin', e2eOrigin())
    .send({
      ...input,
      passwordConfirmation: input.passwordConfirmation ?? input.password,
    });
}

export async function loginForE2e(
  app: INestApplication<App>,
  prisma: PrismaService,
  cpf: string,
  email: string,
  password?: string,
): Promise<AuthSession> {
  const user = await prisma.user.findFirstOrThrow({
    where: { cpf, email },
    select: { id: true, role: true },
  });
  const isAdmin = user.role === 'ADMIN';

  const loginPassword =
    password ?? (isAdmin ? E2E_ADMIN_PASSWORD : E2E_PARTICIPANT_PASSWORD);

  const response = await request(app.getHttpServer())
    .post(isAdmin ? '/auth/admin/login' : '/auth/login')
    .set('Origin', e2eOrigin())
    .send(
      isAdmin
        ? { cpf, email, password: loginPassword }
        : { email, password: loginPassword },
    )
    .expect(200);
  const setCookie = response.headers['set-cookie'] as unknown as
    | string[]
    | undefined;
  if (!Array.isArray(setCookie) || !setCookie[0]) {
    throw new Error('Login did not return an access token cookie.');
  }

  return {
    cookie: setCookie[0].split(';')[0],
    csrfToken: (response.body as LoginBody).csrfToken,
  };
}

export async function loginAttemptForE2e(
  app: INestApplication<App>,
  prisma: PrismaService,
  cpf: string,
  email: string,
  password: string,
) {
  const user = await prisma.user.findFirstOrThrow({
    where: { cpf, email },
    select: { role: true },
  });
  const isAdmin = user.role === 'ADMIN';

  return request(app.getHttpServer())
    .post(isAdmin ? '/auth/admin/login' : '/auth/login')
    .set('Origin', e2eOrigin())
    .send(isAdmin ? { cpf, email, password } : { email, password });
}

export class AdminE2eHarness {
  private constructor(
    readonly app: INestApplication<App>,
    readonly prisma: PrismaService,
  ) {}

  static async create(options?: {
    auditService?: Pick<AuditService, 'record'>;
    reconciliationRepository?: Pick<
      AdminReconciliationRepository,
      'withTransaction' | 'findByIdempotencyKey'
    >;
  }): Promise<AdminE2eHarness> {
    assertDisposableTestDatabase();
    const builder = Test.createTestingModule({
      imports: [AppModule],
    });
    if (options?.auditService) {
      builder.overrideProvider(AuditService).useValue(options.auditService);
    }
    if (options?.reconciliationRepository) {
      builder
        .overrideProvider(AdminReconciliationRepository)
        .useValue(options.reconciliationRepository);
    }
    const moduleFixture = await builder.compile();
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
    const harness = new AdminE2eHarness(app, moduleFixture.get(PrismaService));
    await truncateDisposableTestDatabase(harness.prisma);
    return harness;
  }

  async login(cpf: string, email: string): Promise<AuthSession> {
    return loginForE2e(this.app, this.prisma, cpf, email);
  }

  async loginLegacy(cpf: string, email: string): Promise<AuthSession> {
    return loginForLegacyE2e(this.app, this.prisma, cpf, email);
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
      .set('Origin', e2eOrigin())
      .set('X-CSRF-Token', session.csrfToken);
  }

  patch(path: string, session: AuthSession) {
    return request(this.app.getHttpServer())
      .patch(path)
      .set('Cookie', session.cookie)
      .set('Origin', e2eOrigin())
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
      try {
        await this.app.close();
      } finally {
        await this.prisma.$disconnect();
      }
    }
  }
}

async function loginForLegacyE2e(
  app: INestApplication<App>,
  prisma: PrismaService,
  cpf: string,
  email: string,
): Promise<AuthSession> {
  const user = await prisma.user.findFirstOrThrow({
    where: { cpf, email },
    select: { id: true, role: true },
  });
  const isAdmin = user.role === 'ADMIN';
  const password = isAdmin ? E2E_ADMIN_PASSWORD : E2E_PARTICIPANT_PASSWORD;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hash(password, 12),
      isActive: true,
      ...(isAdmin ? { adminProfile: AdminProfile.GENERAL } : {}),
    },
  });

  return loginForE2e(app, prisma, cpf, email, password);
}
