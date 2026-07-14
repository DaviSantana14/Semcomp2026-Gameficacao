import {
  ActionRedemptionMethod,
  ActionType,
  AuditEntityType,
  AuditOperation,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request, { Response } from 'supertest';
import { AdminE2eHarness, AuthSession } from './support/admin-e2e-harness';
import {
  assertDisposableTestDatabase,
  hasDisposableTestDatabaseConfiguration,
  isDisposableTestDatabase,
} from './support/e2e-database-cleanup';

type Page<T> = {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

const describeDisposable = hasDisposableTestDatabaseConfiguration()
  ? describe
  : describe.skip;

describeDisposable('Admin actions and codes (e2e)', () => {
  let harness: AdminE2eHarness;
  let adminSession: AuthSession;
  let firstSession: AuthSession;
  let secondSession: AuthSession;
  let firstId: string;
  let secondId: string;
  let reusableActionId: string;
  let legacyActionId: string;
  let reusableCode: string;
  let suffix: string;
  const userIds: string[] = [];
  const actionIds: string[] = [];
  const claimCodeIds: string[] = [];

  beforeAll(async () => {
    harness = await AdminE2eHarness.create();
    suffix = randomUUID();
    reusableCode = `ACTIONS-${suffix}`.toUpperCase();
    const users = await Promise.all([
      harness.prisma.user.create({
        data: {
          name: `Actions admin ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 1),
          email: `actions-admin-${suffix}@example.test`,
          role: UserRole.ADMIN,
        },
      }),
      harness.prisma.user.create({
        data: {
          name: `Actions Alpha ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 2),
          email: `actions-alpha-${suffix}@example.test`,
        },
      }),
      harness.prisma.user.create({
        data: {
          name: `Actions Beta ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 3),
          email: `actions-beta-${suffix}@example.test`,
        },
      }),
    ]);
    userIds.push(...users.map(({ id }) => id));
    firstId = users[1].id;
    secondId = users[2].id;

    const actions = await Promise.all([
      harness.prisma.action.create({
        data: {
          name: `Actions reusable ${suffix}`,
          type: ActionType.BONUS,
          code: reusableCode,
          points: 13,
          isCodeActive: true,
        },
      }),
      harness.prisma.action.create({
        data: {
          name: `Actions legacy ${suffix}`,
          type: ActionType.DYNAMIC,
          code: `LEGACY-${suffix}`.toUpperCase(),
          points: 5,
          isCodeActive: true,
        },
      }),
    ]);
    reusableActionId = actions[0].id;
    legacyActionId = actions[1].id;
    actionIds.push(...actions.map(({ id }) => id));

    adminSession = await harness.login(users[0].cpf, users[0].email);
    firstSession = await harness.login(users[1].cpf, users[1].email);
    secondSession = await harness.login(users[2].cpf, users[2].email);
  });

  afterAll(async () => {
    if (harness) await harness.close();
  });

  afterEach(async () => {
    if (harness) await removeAuditFailureTrigger(harness);
  });

  it('creates and edits an action while preserving its redemption snapshot', async () => {
    const originalName = `Actions managed ${randomUUID()}`;
    const created = await harness
      .post('/actions', adminSession)
      .send({
        name: originalName,
        type: ActionType.BONUS,
        points: 23,
        isActive: true,
        reason: 'Criacao administrativa da atividade',
      })
      .expect(201);
    const id = (created.body as { id: string }).id;
    actionIds.push(id);

    const createdLedger = await harness.prisma.adminAuditEvent.findMany({
      where: { entityId: id },
      select: { operation: true, reason: true, before: true, after: true },
    });
    expect(createdLedger).toHaveLength(1);
    expect(createdLedger[0]?.operation).toBe(AuditOperation.ACTION_CREATED);
    expect(createdLedger[0]?.reason).toBe(
      'Criacao administrativa da atividade',
    );
    expect(createdLedger[0]?.before).toBeNull();
    expect(createdLedger[0]?.after as Record<string, unknown>).toMatchObject({
      id,
      name: originalName,
      points: 23,
      isActive: true,
    });

    await harness
      .post(`/actions/${id}/redeem`, secondSession)
      .expect(201)
      .expect(({ body }: Response) =>
        expect(body).toMatchObject({ awardedPoints: 23 }),
      );
    await harness
      .patch(`/admin/actions/${id}`, adminSession)
      .send({
        name: `${originalName} edited`,
        points: 99,
        isActive: false,
        reason: 'Edicao administrativa da atividade',
      })
      .expect(200)
      .expect(({ body }: Response) =>
        expect(body).toMatchObject({
          id,
          name: `${originalName} edited`,
          points: 99,
          isActive: false,
        }),
      );

    const ledger = await harness.prisma.adminAuditEvent.findMany({
      where: { entityId: id },
      orderBy: { createdAt: 'asc' },
      select: { operation: true, reason: true, before: true, after: true },
    });
    expect(ledger).toHaveLength(2);
    expect(ledger[1]?.operation).toBe(AuditOperation.ACTION_UPDATED);
    expect(ledger[1]?.reason).toBe('Edicao administrativa da atividade');
    expect(ledger[1]?.before as Record<string, unknown>).toMatchObject({
      name: originalName,
      points: 23,
    });
    expect(ledger[1]?.after as Record<string, unknown>).toMatchObject({
      name: `${originalName} edited`,
      points: 99,
      isActive: false,
    });

    await harness
      .patch(`/admin/actions/${id}`, adminSession)
      .send({
        name: `${originalName} edited`,
        points: 99,
        isActive: false,
        reason: 'Confirmacao administrativa sem alteracao',
      })
      .expect(200);
    expect(
      await harness.prisma.adminAuditEvent.count({ where: { entityId: id } }),
    ).toBe(2);

    await harness
      .patch(`/admin/actions/${id}`, adminSession)
      .send({ name: 'Nao deve persistir', reason: 'curto' })
      .expect(400);
    expect(
      await harness.prisma.adminAuditEvent.count({ where: { entityId: id } }),
    ).toBe(2);

    const missingId = randomUUID();
    await harness
      .patch(`/admin/actions/${missingId}`, adminSession)
      .send({
        name: 'Nao deve persistir',
        reason: 'Edicao administrativa de alvo ausente',
      })
      .expect(404);
    expect(
      await harness.prisma.adminAuditEvent.count({
        where: { entityId: missingId },
      }),
    ).toBe(0);
    const event = await harness.prisma.pointEvent.findFirstOrThrow({
      where: { userId: secondId, actionId: id },
    });
    expect(event.points).toBe(23);
    expect(event.redemptionMethod).toBe(ActionRedemptionMethod.DIRECT);
    await harness.post(`/actions/${id}/redeem`, firstSession).expect(400);
  });

  it('rolls back action creation and editing when audit persistence fails', async () => {
    const failedCreateName = `Actions failed create ${randomUUID()}`;
    const updateTarget = await harness.prisma.action.findUniqueOrThrow({
      where: { id: reusableActionId },
    });
    const failedCreateReason =
      'Criacao que deve reverter por falha de auditoria';
    const failedUpdateReason =
      'Edicao que deve reverter por falha de auditoria';
    await installAuditFailureTrigger(harness);

    await harness
      .post('/actions', adminSession)
      .send({
        name: failedCreateName,
        type: ActionType.BONUS,
        points: 31,
        reason: failedCreateReason,
      })
      .expect(500);
    expect(
      await harness.prisma.action.findFirst({
        where: { name: failedCreateName },
      }),
    ).toBeNull();
    expect(
      await harness.prisma.adminAuditEvent.count({
        where: { reason: failedCreateReason },
      }),
    ).toBe(0);

    await harness
      .patch(`/admin/actions/${reusableActionId}`, adminSession)
      .send({
        name: 'Actions update that must roll back',
        reason: failedUpdateReason,
      })
      .expect(500);
    expect(
      await harness.prisma.action.findUniqueOrThrow({
        where: { id: reusableActionId },
      }),
    ).toEqual(updateTarget);
    expect(
      await harness.prisma.adminAuditEvent.count({
        where: { reason: failedUpdateReason },
      }),
    ).toBe(0);
  });

  it('controls action and reusable-code activation independently', async () => {
    await harness
      .patch(`/admin/actions/${reusableActionId}`, adminSession)
      .send({
        isActive: false,
        isCodeActive: true,
        reason: 'Desativacao administrativa da atividade',
      })
      .expect(200)
      .expect(({ body }: Response) =>
        expect(body).toMatchObject({ isActive: false, isCodeActive: true }),
      );
    await harness
      .patch(`/admin/actions/${reusableActionId}`, adminSession)
      .send({
        isActive: true,
        isCodeActive: false,
        reason: 'Reativacao administrativa da atividade',
      })
      .expect(200);
    await harness
      .post('/actions/redeem-code', secondSession)
      .send({ code: reusableCode })
      .expect(400);
    await harness
      .patch(`/admin/actions/${reusableActionId}`, adminSession)
      .send({
        isCodeActive: true,
        reason: 'Reativacao administrativa do codigo',
      })
      .expect(200);
  });

  it('generates, filters, toggles, and consumes unique claim codes', async () => {
    const created = await harness
      .post('/actions', adminSession)
      .send({
        name: `Actions generated ${suffix}`,
        type: ActionType.CHECKIN,
        points: 7,
        reason: 'Criacao administrativa da atividade',
      })
      .expect(201);
    const actionId = (created.body as { id: string }).id;
    actionIds.push(actionId);
    const generated = await harness
      .post(`/admin/actions/${actionId}/claim-codes/generate`, adminSession)
      .send({
        quantity: 2,
        reason: 'Geracao administrativa dos codigos unicos',
      })
      .expect(201);
    const codes = (generated.body as { codes: string[] }).codes;
    expect(codes).toHaveLength(2);
    const rows = await harness.prisma.claimCode.findMany({
      where: { code: { in: codes } },
      orderBy: { code: 'asc' },
    });
    claimCodeIds.push(...rows.map(({ id }) => id));
    expect(rows).toHaveLength(2);
    const batchEvents = await harness.prisma.adminAuditEvent.findMany({
      where: {
        operation: AuditOperation.CLAIM_CODE_BATCH_GENERATED,
        entityType: AuditEntityType.CLAIM_CODE_BATCH,
        after: { path: ['actionId'], equals: actionId },
      },
    });
    expect(batchEvents).toHaveLength(1);
    expect(batchEvents[0]?.after).toEqual({
      requestedQuantity: 2,
      createdQuantity: 2,
      redemptionMethod: ActionRedemptionMethod.CLAIM_CODE,
      actionId,
    });
    expect(JSON.stringify(batchEvents[0])).not.toContain(codes[0]);
    expect(JSON.stringify(batchEvents[0])).not.toContain(codes[1]);
    const filtered = await harness
      .get(
        `/admin/audit-events?entityType=${AuditEntityType.CLAIM_CODE_BATCH}&entityId=${batchEvents[0].entityId}`,
        adminSession,
      )
      .expect(200);
    expect((filtered.body as Page<{ id: string }>).items).toHaveLength(1);
    expect((filtered.body as Page<{ id: string }>).meta.total).toBe(1);

    await harness
      .patch(`/admin/claim-codes/${rows[0].id}/status`, adminSession)
      .send({
        isActive: false,
        reason: 'Desativacao administrativa do codigo unico',
      })
      .expect(200)
      .expect(({ body }: Response) =>
        expect(body).toMatchObject({ status: 'DISABLED' }),
      );
    const disabled = await harness
      .get(
        `/admin/claim-codes?actionId=${actionId}&status=disabled&page=1&limit=20`,
        adminSession,
      )
      .expect(200);
    expect(
      (disabled.body as Page<{ id: string }>).items.map(({ id }) => id),
    ).toEqual([rows[0].id]);
    await harness
      .patch(`/admin/claim-codes/${rows[0].id}/status`, adminSession)
      .send({
        isActive: true,
        reason: 'Reativacao administrativa do codigo unico',
      })
      .expect(200);
    const statusEvents = await harness.prisma.adminAuditEvent.findMany({
      where: {
        entityType: AuditEntityType.CLAIM_CODE,
        entityId: rows[0].id,
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(statusEvents).toHaveLength(2);
    expect(statusEvents[0]?.operation).toBe(
      AuditOperation.CLAIM_CODE_STATUS_CHANGED,
    );
    expect(statusEvents[0]?.before).toMatchObject({
      id: rows[0].id,
      isActive: true,
      isUsed: false,
    });
    const statusBefore = statusEvents[0]?.before as {
      maskedCode?: unknown;
    };
    expect(typeof statusBefore.maskedCode).toBe('string');
    expect(statusBefore.maskedCode as string).toContain('*');
    expect(JSON.stringify(statusEvents)).not.toContain(rows[0].code);

    await harness
      .patch(`/admin/claim-codes/${rows[0].id}/status`, adminSession)
      .send({
        isActive: true,
        reason: 'Confirmacao administrativa sem mudanca',
      })
      .expect(200);
    expect(
      await harness.prisma.adminAuditEvent.count({
        where: { entityId: rows[0].id },
      }),
    ).toBe(2);

    await harness
      .post('/actions/redeem-code', secondSession)
      .send({ code: rows[1].code })
      .expect(201);
    const used = await harness
      .get(
        `/admin/claim-codes?actionId=${actionId}&status=used&page=1&limit=20`,
        adminSession,
      )
      .expect(200);
    const usedItem = (
      used.body as Page<{
        id: string;
        status: string;
        usedAt: string | null;
        usedBy: { id: string } | null;
      }>
    ).items.find(({ id }) => id === rows[1].id);
    expect(usedItem).toMatchObject({
      status: 'USED',
      usedBy: { id: secondId },
    });
    expect(typeof usedItem?.usedAt).toBe('string');
    expect(
      await harness.prisma.pointEvent.findUnique({
        where: { claimCodeId: rows[1].id },
        select: {
          claimCodeId: true,
          userId: true,
          redemptionMethod: true,
        },
      }),
    ).toEqual({
      claimCodeId: rows[1].id,
      userId: secondId,
      redemptionMethod: ActionRedemptionMethod.CLAIM_CODE,
    });
    const conflict = await harness
      .patch(`/admin/claim-codes/${rows[1].id}/status`, adminSession)
      .send({
        isActive: true,
        reason: 'Reativacao administrativa de codigo utilizado',
      })
      .expect(409);
    const conflictBody = JSON.stringify(conflict.body);
    expect(conflictBody).not.toContain(rows[1].code);
    expect(conflictBody).not.toContain(`actions-beta-${suffix}@example.test`);
    expect(conflictBody).not.toContain(harness.uniqueCpf(suffix, 3));
    expect(
      await harness.prisma.adminAuditEvent.count({
        where: {
          operation: AuditOperation.CLAIM_CODE_STATUS_CHANGED,
          entityId: rows[1].id,
        },
      }),
    ).toBe(0);
  });

  it('requires admin authorization and a valid reason for code mutations', async () => {
    const code = await harness.prisma.claimCode.create({
      data: {
        actionId: reusableActionId,
        code: `AUTH-${randomUUID()}`.toUpperCase(),
      },
    });
    claimCodeIds.push(code.id);
    await request(harness.app.getHttpServer())
      .post(`/admin/actions/${reusableActionId}/claim-codes/generate`)
      .send({ quantity: 1, reason: 'Geracao sem autenticacao' })
      .expect(401);
    await request(harness.app.getHttpServer())
      .patch(`/admin/claim-codes/${code.id}/status`)
      .send({ isActive: false, reason: 'Status sem autenticacao' })
      .expect(401);
    await harness
      .post(
        `/admin/actions/${reusableActionId}/claim-codes/generate`,
        firstSession,
      )
      .send({ quantity: 1, reason: 'Geracao nao autorizada de codigos' })
      .expect(403);
    await harness
      .post(
        `/admin/actions/${reusableActionId}/claim-codes/generate`,
        adminSession,
      )
      .send({ quantity: 1 })
      .expect(400);
    await harness
      .patch(`/admin/claim-codes/${code.id}/status`, adminSession)
      .send({ isActive: false })
      .expect(400);
  });

  it('uses canonical short and long masks without persisting raw codes', async () => {
    const action = await harness.prisma.action.create({
      data: {
        name: `Mask formats ${randomUUID()}`,
        type: ActionType.BONUS,
        points: 1,
      },
    });
    actionIds.push(action.id);
    const codes = await Promise.all([
      harness.prisma.claimCode.create({
        data: { actionId: action.id, code: 'A1B2' },
      }),
      harness.prisma.claimCode.create({
        data: { actionId: action.id, code: `AB${randomUUID()}YZ` },
      }),
    ]);
    claimCodeIds.push(...codes.map(({ id }) => id));

    await Promise.all(
      codes.map(({ id }) =>
        harness
          .patch(`/admin/claim-codes/${id}/status`, adminSession)
          .send({
            isActive: false,
            reason: 'Validacao administrativa da mascara canonica',
          })
          .expect(200),
      ),
    );

    const events = await harness.prisma.adminAuditEvent.findMany({
      where: { entityId: { in: codes.map(({ id }) => id) } },
      orderBy: { entityId: 'asc' },
    });
    expect(events).toHaveLength(2);
    const masks = events.map(
      ({ before }) => (before as { maskedCode: string }).maskedCode,
    );
    expect(masks).toContain('****');
    expect(masks).toContain(`AB${'*'.repeat(36)}YZ`);
    const serialized = JSON.stringify(events);
    for (const { code } of codes) expect(serialized).not.toContain(code);
  });

  it('audits exactly one winner for concurrent identical status requests', async () => {
    const action = await harness.prisma.action.create({
      data: {
        name: `Concurrent status ${randomUUID()}`,
        type: ActionType.BONUS,
        points: 1,
      },
    });
    actionIds.push(action.id);
    const code = await harness.prisma.claimCode.create({
      data: { actionId: action.id, code: `RACE-${randomUUID()}`.toUpperCase() },
    });
    claimCodeIds.push(code.id);

    const responses = await Promise.all([
      harness
        .patch(`/admin/claim-codes/${code.id}/status`, adminSession)
        .send({ isActive: false, reason: 'Primeira desativacao concorrente' }),
      harness
        .patch(`/admin/claim-codes/${code.id}/status`, adminSession)
        .send({ isActive: false, reason: 'Segunda desativacao concorrente' }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    expect(
      await harness.prisma.adminAuditEvent.count({
        where: {
          operation: AuditOperation.CLAIM_CODE_STATUS_CHANGED,
          entityType: AuditEntityType.CLAIM_CODE,
          entityId: code.id,
        },
      }),
    ).toBe(1);
  });

  it('rolls back generated codes and status changes when audit fails', async () => {
    const action = await harness.prisma.action.create({
      data: {
        name: `Codes rollback ${randomUUID()}`,
        type: ActionType.BONUS,
        points: 3,
      },
    });
    actionIds.push(action.id);
    const existing = await harness.prisma.claimCode.create({
      data: { actionId: action.id, code: `ROLL-${randomUUID()}`.toUpperCase() },
    });
    claimCodeIds.push(existing.id);
    await installAuditFailureTrigger(harness);

    await harness
      .post(`/admin/actions/${action.id}/claim-codes/generate`, adminSession)
      .send({
        quantity: 3,
        reason: 'Geracao que deve reverter por falha de auditoria',
      })
      .expect(500);
    expect(
      await harness.prisma.claimCode.count({ where: { actionId: action.id } }),
    ).toBe(1);

    await harness
      .patch(`/admin/claim-codes/${existing.id}/status`, adminSession)
      .send({
        isActive: false,
        reason: 'Status que deve reverter por falha de auditoria',
      })
      .expect(500);
    expect(
      await harness.prisma.claimCode.findUniqueOrThrow({
        where: { id: existing.id },
        select: { isActive: true },
      }),
    ).toEqual({ isActive: true });
  });

  it('separates reusable-code history from unused legacy actions', async () => {
    await harness
      .post('/actions/redeem-code', firstSession)
      .send({ code: reusableCode })
      .expect(201);
    const reusable = await harness
      .get(
        `/admin/reusable-codes?search=${encodeURIComponent('Actions')}&page=1&limit=20`,
        adminSession,
      )
      .expect(200);
    const items = (reusable.body as Page<{ id: string; totalUses: number }>)
      .items;
    expect(items.find(({ id }) => id === reusableActionId)?.totalUses).toBe(1);
    expect(items.find(({ id }) => id === legacyActionId)?.totalUses).toBe(0);

    const history = await harness
      .get(
        `/admin/reusable-codes/${reusableActionId}/redemptions?page=1&limit=1`,
        adminSession,
      )
      .expect(200);
    const page = history.body as Page<{
      points: number;
      participant: { id: string };
    }>;
    expect(page.meta.total).toBe(1);
    expect(page.items[0]).toMatchObject({
      points: 13,
      participant: { id: firstId },
    });
  });
});

async function installAuditFailureTrigger(harness: AdminE2eHarness) {
  await assertDisposableConnection(harness);
  await removeAuditFailureTrigger(harness);
  await harness.prisma.$executeRawUnsafe(`
    CREATE FUNCTION fail_admin_audit_insert_for_e2e() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'forced audit writer failure';
    END;
    $$ LANGUAGE plpgsql
  `);
  await harness.prisma.$executeRawUnsafe(`
    CREATE TRIGGER fail_admin_audit_insert_for_e2e
    BEFORE INSERT ON "AdminAuditEvent"
    FOR EACH ROW EXECUTE FUNCTION fail_admin_audit_insert_for_e2e()
  `);
}

async function removeAuditFailureTrigger(harness: AdminE2eHarness) {
  await assertDisposableConnection(harness);
  await harness.prisma.$executeRawUnsafe(
    'DROP TRIGGER IF EXISTS fail_admin_audit_insert_for_e2e ON "AdminAuditEvent"',
  );
  await harness.prisma.$executeRawUnsafe(
    'DROP FUNCTION IF EXISTS fail_admin_audit_insert_for_e2e()',
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
