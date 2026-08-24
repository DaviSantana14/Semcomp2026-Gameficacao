import { ActionType, UserRole } from '@prisma/client';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { generateClaimCode } from '../src/common/event-code';
import { AdminE2eHarness, type AuthSession } from './support/admin-e2e-harness';
import {
  assertDisposableTestDatabase,
  hasDisposableTestDatabaseConfiguration,
  isDisposableTestDatabase,
  truncateDisposableTestDatabase,
} from './support/e2e-database-cleanup';

type ClaimCodeBatchResponse = {
  batch: { id: string; createdQuantity: number };
  codes: string[];
};

type BatchPage = {
  items: Array<{ id: string; action: { id: string }; counts: unknown }>;
  meta: { total: number };
};

const describeDisposable = hasDisposableTestDatabaseConfiguration()
  ? describe
  : describe.skip;

describeDisposable('Admin claim-code batches (e2e)', () => {
  let harness: AdminE2eHarness;
  let adminSession: AuthSession;
  let actionId: string;
  let adminId: string;
  let suffix: string;
  let harnessFinalized = false;

  beforeAll(async () => {
    harness = await AdminE2eHarness.create();
    suffix = randomUUID();
    const admin = await harness.prisma.user.create({
      data: {
        name: `Batch admin ${suffix}`,
        cpf: harness.uniqueCpf(suffix, 1),
        email: `batch-admin-${suffix}@example.test`,
        role: UserRole.ADMIN,
        adminProfile: 'GENERAL',
      },
    });
    adminId = admin.id;
    const action = await harness.prisma.action.create({
      data: {
        name: `Batch action ${suffix}`,
        type: ActionType.CHECKIN,
        points: 7,
      },
    });
    actionId = action.id;
    adminSession = await harness.loginLegacy(admin.cpf, admin.email);
  });

  afterEach(async () => {
    if (harness && !harnessFinalized) await removeAuditFailureTrigger(harness);
  });

  afterAll(async () => {
    if (!harnessFinalized && harness) await harness.close();
  });

  it('persists, lists, redownloads and rolls back claim-code batches', async () => {
    await request(harness.app.getHttpServer())
      .get('/admin/claim-code-batches')
      .expect(401);
    const generated = await harness
      .post(`/admin/actions/${actionId}/claim-codes/generate`, adminSession)
      .send({
        quantity: 2,
        reason: 'Geracao administrativa do lote E2E',
      })
      .expect(201);
    const body = generated.body as ClaimCodeBatchResponse;
    const batchId = body.batch.id;
    const sortedCodes = [...body.codes].sort();

    expect(body.batch.createdQuantity).toBe(2);
    expect(body.codes).toHaveLength(2);
    const persistedCodes = await harness.prisma.claimCode.findMany({
      where: { batchId },
      orderBy: { code: 'asc' },
      select: { code: true, batchId: true },
    });
    expect(persistedCodes).toEqual(
      sortedCodes.map((code) => ({ code, batchId })),
    );

    const detail = await harness
      .get(`/admin/claim-code-batches/${batchId}`, adminSession)
      .expect(200);
    expect(detail.body).toMatchObject({
      id: batchId,
      action: { id: actionId },
      createdBy: { id: adminId },
      createdQuantity: 2,
      counts: { available: 2, disabled: 0, used: 0, blocked: 0 },
    });
    expect(JSON.stringify(detail.body)).not.toContain(body.codes[0]);

    const listed = await harness
      .get(
        `/admin/claim-code-batches?actionId=${actionId}&actorAdminId=${adminId}&page=1&limit=20`,
        adminSession,
      )
      .expect(200);
    expect(listed.body as BatchPage).toMatchObject({
      meta: { total: 1 },
      items: [{ id: batchId, action: { id: actionId } }],
    });
    expect(JSON.stringify(listed.body)).not.toContain(body.codes[0]);

    const text = await harness
      .get(`/admin/claim-code-batches/${batchId}/download.txt`, adminSession)
      .expect(200);
    expect(text.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(text.headers['cache-control']).toBe('no-store');
    expect(text.headers['content-disposition']).toBe(
      `attachment; filename="codigos-${batchId}.txt"`,
    );
    expect(text.text).toBe(`${sortedCodes.join('\n')}\n`);

    const legacy = await harness.prisma.claimCode.create({
      data: { actionId, code: generateClaimCode() },
    });
    await harness
      .get(`/admin/claim-code-batches/${legacy.id}`, adminSession)
      .expect(404);
    await harness
      .get('/admin/claim-code-batches/missing-batch', adminSession)
      .expect(404);
    await harness
      .get('/admin/claim-code-batches/missing-batch/download.txt', adminSession)
      .expect(404);

    const batchCountBeforeFailure = await harness.prisma.claimCodeBatch.count({
      where: { actionId },
    });
    const codeCountBeforeFailure = await harness.prisma.claimCode.count({
      where: { actionId },
    });
    await installAuditFailureTrigger(harness);
    await harness
      .post(`/admin/actions/${actionId}/claim-codes/generate`, adminSession)
      .send({
        quantity: 2,
        reason: 'Geracao que deve reverter por falha de auditoria E2E',
      })
      .expect(500);
    expect(
      await harness.prisma.claimCodeBatch.count({ where: { actionId } }),
    ).toBe(batchCountBeforeFailure);
    expect(await harness.prisma.claimCode.count({ where: { actionId } })).toBe(
      codeCountBeforeFailure,
    );
    await removeAuditFailureTrigger(harness);

    const restartedApp = await createFreshApp();
    try {
      const redownloaded = await request(restartedApp.getHttpServer())
        .get(`/admin/claim-code-batches/${batchId}/download.txt`)
        .set('Cookie', adminSession.cookie)
        .expect(200);
      expect(redownloaded.text).toBe(`${sortedCodes.join('\n')}\n`);
    } finally {
      await restartedApp.close();
      await truncateDisposableTestDatabase(harness.prisma);
      await harness.app.close();
      harnessFinalized = true;
    }
  });
});

async function createFreshApp(): Promise<INestApplication<App>> {
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
  return app;
}

async function installAuditFailureTrigger(harness: AdminE2eHarness) {
  await assertDisposableConnection(harness);
  await removeAuditFailureTrigger(harness);
  await harness.prisma.$executeRawUnsafe(`
    CREATE FUNCTION fail_admin_audit_insert_for_batch_e2e() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'forced batch audit writer failure';
    END;
    $$ LANGUAGE plpgsql
  `);
  await harness.prisma.$executeRawUnsafe(`
    CREATE TRIGGER fail_admin_audit_insert_for_batch_e2e
    BEFORE INSERT ON "AdminAuditEvent"
    FOR EACH ROW EXECUTE FUNCTION fail_admin_audit_insert_for_batch_e2e()
  `);
}

async function removeAuditFailureTrigger(harness: AdminE2eHarness) {
  await assertDisposableConnection(harness);
  await harness.prisma.$executeRawUnsafe(
    'DROP TRIGGER IF EXISTS fail_admin_audit_insert_for_batch_e2e ON "AdminAuditEvent"',
  );
  await harness.prisma.$executeRawUnsafe(
    'DROP FUNCTION IF EXISTS fail_admin_audit_insert_for_batch_e2e()',
  );
}

async function assertDisposableConnection(harness: AdminE2eHarness) {
  assertDisposableTestDatabase();
  const [{ databaseName } = { databaseName: '' }] =
    await harness.prisma.$queryRawUnsafe<Array<{ databaseName: string }>>(
      'SELECT current_database() AS "databaseName"',
    );
  if (
    !isDisposableTestDatabase(process.env.NODE_ENV, databaseName) ||
    databaseName !== process.env.DB_NAME
  ) {
    throw new Error(
      'Refusing E2E trigger setup outside the disposable database.',
    );
  }
}
