import {
  ActionType,
  AuditEntityType,
  AuditOperation,
  ClaimCodeBulkOutcome,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { generateClaimCode } from '../src/common/event-code';
import { AdminE2eHarness, type AuthSession } from './support/admin-e2e-harness';
import {
  assertDisposableTestDatabase,
  hasDisposableTestDatabaseConfiguration,
} from './support/e2e-database-cleanup';

type BulkItem = {
  requestedClaimCodeId: string;
  claimCodeId: string | null;
  maskedCode: string | null;
  outcome: ClaimCodeBulkOutcome;
};

type BulkResponse = {
  id: string;
  counts: {
    selected: number;
    changed: number;
    unchanged: number;
    used: number;
    notFound: number;
  };
  items: BulkItem[];
};

const describeDisposable = hasDisposableTestDatabaseConfiguration()
  ? describe
  : describe.skip;

describeDisposable('Admin claim-code bulk status (e2e)', () => {
  let harness: AdminE2eHarness;
  let adminSession: AuthSession;
  let participantSession: AuthSession;
  let actionId: string;
  let suffix: string;

  beforeAll(async () => {
    harness = await AdminE2eHarness.create();
    suffix = randomUUID();
    const [admin, participant] = await Promise.all([
      harness.prisma.user.create({
        data: {
          name: `Bulk admin ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 1),
          email: `bulk-admin-${suffix}@example.test`,
          role: UserRole.ADMIN,
        },
      }),
      harness.prisma.user.create({
        data: {
          name: `Bulk participant ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 2),
          email: `bulk-participant-${suffix}@example.test`,
        },
      }),
    ]);
    const action = await harness.prisma.action.create({
      data: {
        name: `Bulk action ${suffix}`,
        type: ActionType.CHECKIN,
        points: 5,
        isActive: true,
      },
    });
    actionId = action.id;
    adminSession = await harness.loginLegacy(admin.cpf, admin.email);
    participantSession = await harness.loginLegacy(
      participant.cpf,
      participant.email,
    );
  });

  beforeEach(async () => {
    const adminSuffix = randomUUID();
    const admin = await harness.prisma.user.create({
      data: {
        name: `Bulk test admin ${adminSuffix}`,
        cpf: harness.uniqueCpf(adminSuffix, 1),
        email: `bulk-test-admin-${adminSuffix}@example.test`,
        role: UserRole.ADMIN,
      },
    });
    adminSession = await harness.loginLegacy(admin.cpf, admin.email);
  });

  afterEach(async () => {
    await removeAuditFailureTrigger(harness);
  });

  afterAll(async () => {
    if (harness) await harness.close();
  });

  it('persists mixed outcomes once and redownloads a masked sorted report', async () => {
    const [changed, unchanged, used] = await Promise.all([
      createCode(true),
      createCode(false),
      createCode(true),
    ]);
    await harness
      .post('/actions/redeem-code', participantSession)
      .send({ code: used.code })
      .expect(201);

    await request(harness.app.getHttpServer())
      .get('/admin/claim-code-bulk-operations')
      .set('Cookie', participantSession.cookie)
      .expect(403);

    const response = await harness
      .post('/admin/claim-codes/bulk-status', adminSession)
      .send({
        ids: [used.id, 'missing-code-id', changed.id, unchanged.id],
        isActive: false,
        reason: 'Desativacao preventiva dos codigos selecionados',
        confirmation: 'DESATIVAR',
      })
      .expect(201);
    const body = response.body as BulkResponse;

    expect(body.counts).toEqual({
      selected: 4,
      changed: 1,
      unchanged: 1,
      used: 1,
      notFound: 1,
    });
    expect(
      body.items.map(({ requestedClaimCodeId }) => requestedClaimCodeId),
    ).toEqual([changed.id, 'missing-code-id', unchanged.id, used.id].sort());
    expect(
      Object.fromEntries(
        body.items.map(({ requestedClaimCodeId, outcome }) => [
          requestedClaimCodeId,
          outcome,
        ]),
      ),
    ).toEqual({
      [changed.id]: ClaimCodeBulkOutcome.CHANGED,
      'missing-code-id': ClaimCodeBulkOutcome.NOT_FOUND,
      [unchanged.id]: ClaimCodeBulkOutcome.ALREADY_IN_STATE,
      [used.id]: ClaimCodeBulkOutcome.ALREADY_USED,
    });

    const persisted = await harness.prisma.claimCode.findMany({
      where: { id: { in: [changed.id, unchanged.id, used.id] } },
      orderBy: { id: 'asc' },
      select: { id: true, code: true, isActive: true, isUsed: true },
    });
    expect(persisted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: changed.id,
          isActive: false,
          isUsed: false,
        }),
        expect.objectContaining({
          id: unchanged.id,
          isActive: false,
          isUsed: false,
        }),
        expect.objectContaining({ id: used.id, isActive: false, isUsed: true }),
      ]),
    );

    const operation =
      await harness.prisma.claimCodeBulkOperation.findUniqueOrThrow({
        where: { id: body.id },
        include: { items: true },
      });
    expect(typeof operation.actorAdminId).toBe('string');
    expect(operation).toMatchObject({
      targetIsActive: false,
      selectedCount: 4,
      changedCount: 1,
      unchangedCount: 1,
      usedCount: 1,
      notFoundCount: 1,
    });
    expect(operation.items).toHaveLength(4);
    expect(JSON.stringify(operation)).not.toContain(changed.code);
    expect(
      await harness.prisma.adminAuditEvent.findMany({
        where: {
          operation: AuditOperation.CLAIM_CODE_BULK_STATUS_CHANGED,
          entityType: AuditEntityType.CLAIM_CODE_BULK_OPERATION,
          entityId: body.id,
        },
      }),
    ).toHaveLength(1);

    const history = await harness
      .get('/admin/claim-code-bulk-operations?page=1&limit=20', adminSession)
      .expect(200);
    expect(history.body).toMatchObject({
      meta: { total: 1 },
      items: [{ id: body.id, counts: body.counts }],
    });

    const detail = await harness
      .get(`/admin/claim-code-bulk-operations/${body.id}`, adminSession)
      .expect(200);
    expect(detail.body).toMatchObject({ id: body.id, counts: body.counts });
    expect(JSON.stringify(detail.body)).not.toContain(changed.code);

    const report = await harness
      .get(
        `/admin/claim-code-bulk-operations/${body.id}/report.csv`,
        adminSession,
      )
      .expect(200);
    expect(report.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(report.headers['cache-control']).toBe('no-store');
    expect(report.headers['content-disposition']).toBe(
      `attachment; filename="codigos-bulk-${body.id}.csv"`,
    );
    expect(report.text).toContain('codigo_id;codigo_mascarado;resultado\r\n');
    expect(report.text).not.toContain(changed.code);
    expect(report.text.indexOf(`${changed.id};`)).toBeLessThan(
      report.text.indexOf(`${unchanged.id};`),
    );
  });

  it('serializes a redemption and bulk disable without changing a used code', async () => {
    const race = await createCode(true);
    const [bulkResponse, redeemResponse] = await Promise.all([
      harness.post('/admin/claim-codes/bulk-status', adminSession).send({
        ids: [race.id],
        isActive: false,
        reason: 'Desativacao concorrente do codigo selecionado',
        confirmation: 'DESATIVAR',
      }),
      harness
        .post('/actions/redeem-code', participantSession)
        .send({ code: race.code }),
    ]);

    expect(bulkResponse.status).toBe(201);
    const final = await harness.prisma.claimCode.findUniqueOrThrow({
      where: { id: race.id },
      select: { isActive: true, isUsed: true },
    });
    const bulkBody = bulkResponse.body as BulkResponse;
    if (final.isUsed) {
      expect(redeemResponse.status).toBe(201);
      expect(bulkBody.items[0]?.outcome).toBe(
        ClaimCodeBulkOutcome.ALREADY_USED,
      );
    } else {
      expect(final.isActive).toBe(false);
      expect(redeemResponse.status).toBe(400);
      expect(bulkBody.items[0]?.outcome).toBe(ClaimCodeBulkOutcome.CHANGED);
    }
  });

  it('rolls back status, operation and items when audit persistence fails', async () => {
    const code = await createCode(true);
    const beforeOperationCount =
      await harness.prisma.claimCodeBulkOperation.count();
    await installAuditFailureTrigger(harness);

    await harness
      .post('/admin/claim-codes/bulk-status', adminSession)
      .send({
        ids: [code.id],
        isActive: false,
        reason: 'Desativacao que deve reverter por falha de auditoria',
        confirmation: 'DESATIVAR',
      })
      .expect(500);

    await expect(
      harness.prisma.claimCode.findUniqueOrThrow({
        where: { id: code.id },
        select: { isActive: true, isUsed: true },
      }),
    ).resolves.toEqual({ isActive: true, isUsed: false });
    expect(await harness.prisma.claimCodeBulkOperation.count()).toBe(
      beforeOperationCount,
    );
    expect(
      await harness.prisma.claimCodeBulkOperationItem.count({
        where: { claimCodeId: code.id },
      }),
    ).toBe(0);
  });

  async function createCode(isActive: boolean) {
    return harness.prisma.claimCode.create({
      data: {
        actionId,
        code: generateClaimCode(),
        isActive,
      },
    });
  }
});

async function installAuditFailureTrigger(harness: AdminE2eHarness) {
  assertDisposableTestDatabase();
  await removeAuditFailureTrigger(harness);
  await harness.prisma.$executeRawUnsafe(`
    CREATE FUNCTION fail_admin_audit_insert_for_bulk_e2e() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'forced bulk audit writer failure';
    END;
    $$ LANGUAGE plpgsql
  `);
  await harness.prisma.$executeRawUnsafe(`
    CREATE TRIGGER fail_admin_audit_insert_for_bulk_e2e
    BEFORE INSERT ON "AdminAuditEvent"
    FOR EACH ROW EXECUTE FUNCTION fail_admin_audit_insert_for_bulk_e2e()
  `);
}

async function removeAuditFailureTrigger(harness: AdminE2eHarness) {
  if (!harness) return;
  assertDisposableTestDatabase();
  await harness.prisma.$executeRawUnsafe(
    'DROP TRIGGER IF EXISTS fail_admin_audit_insert_for_bulk_e2e ON "AdminAuditEvent"',
  );
  await harness.prisma.$executeRawUnsafe(
    'DROP FUNCTION IF EXISTS fail_admin_audit_insert_for_bulk_e2e()',
  );
}
