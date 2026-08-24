import {
  ActionRedemptionMethod,
  PointEventKind,
  PointEventSource,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AdminE2eHarness, AuthSession } from './support/admin-e2e-harness';

type ReconciliationItem = {
  participantId: string;
  name: string;
  storedPoints: number;
  ledgerPoints: number;
  pointsDifference: number;
  storedXp: number;
  ledgerXp: number;
  xpDifference: number;
  status: 'CONSISTENT' | 'DIVERGENT';
  lastEventAt: string | null;
};

type ReconciliationPage = {
  items: ReconciliationItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

type ReconciliationConfirmation = {
  before: ReconciliationItem;
  after: ReconciliationItem;
  pointEvent: {
    id: string;
    pointsDelta: number;
    xpDelta: number;
    source: string;
    origin: string;
  };
  pointEvents: Array<{
    id: string;
    pointsDelta: number;
    xpDelta: number;
    source: string;
    origin: string;
  }>;
  auditEvent: { id: string; operation: string };
  replayed: boolean;
};

describe('Admin reconciliation (e2e)', () => {
  let harness: AdminE2eHarness;
  let adminSession: AuthSession;
  let participantSession: AuthSession;
  const participantIds: Record<string, string> = {};

  beforeAll(async () => {
    harness = await AdminE2eHarness.create();
    const suffix = randomUUID();
    const users = await Promise.all([
      harness.prisma.user.create({
        data: {
          name: `Reconciliation admin ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 1),
          email: `reconciliation-admin-${suffix}@example.test`,
          role: UserRole.ADMIN,
          adminProfile: 'GENERAL',
        },
      }),
      createParticipant('No events', 0, 0, 2),
      createParticipant('Consistent', 12, 5, 3),
      createParticipant('Points only', 10, 10, 4),
      createParticipant('XP only', 10, 10, 5),
      createParticipant('Both', 10, 10, 6),
    ]);
    const [admin, noEvents, consistent, pointsOnly, xpOnly, both] = users;
    Object.assign(participantIds, {
      noEvents: noEvents.id,
      consistent: consistent.id,
      pointsOnly: pointsOnly.id,
      xpOnly: xpOnly.id,
      both: both.id,
    });

    await harness.prisma.pointEvent.createMany({
      data: [
        event(consistent.id, 15, 5, PointEventSource.ADMIN_GRANT),
        event(consistent.id, -3, 0, PointEventSource.REWARD_REDEMPTION),
        event(pointsOnly.id, 8, 10, PointEventSource.ACTION_REDEEM),
        event(xpOnly.id, 10, 7, PointEventSource.ADMIN_ADJUST),
        event(both.id, 15, 5, PointEventSource.ADMIN_ADJUST),
        event(admin.id, 99, 99, PointEventSource.ADMIN_GRANT),
      ],
    });

    [adminSession, participantSession] = await Promise.all([
      harness.loginLegacy(admin.cpf, admin.email),
      harness.loginLegacy(noEvents.cpf, noEvents.email),
    ]);

    function createParticipant(
      label: string,
      points: number,
      xp: number,
      discriminator: number,
    ) {
      return harness.prisma.user.create({
        data: {
          name: `Reconciliation ${label} ${suffix}`,
          cpf: harness.uniqueCpf(suffix, discriminator),
          email: `reconciliation-${label.replace(/\s/g, '-').toLowerCase()}-${suffix}@example.test`,
          points,
          xp,
        },
      });
    }
  });

  afterAll(async () => {
    if (harness) await harness.close();
  });

  it('aggregates the full ledger and includes participants without events', async () => {
    await expectDetail('noEvents', {
      ledgerPoints: 0,
      ledgerXp: 0,
      pointsDifference: 0,
      xpDifference: 0,
      status: 'CONSISTENT',
      lastEventAt: null,
    });
    await expectDetail('consistent', {
      ledgerPoints: 12,
      ledgerXp: 5,
      status: 'CONSISTENT',
    });
    await expectDetail('pointsOnly', {
      pointsDifference: 2,
      xpDifference: 0,
      status: 'DIVERGENT',
    });
    await expectDetail('xpOnly', {
      pointsDifference: 0,
      xpDifference: 3,
      status: 'DIVERGENT',
    });
    await expectDetail('both', {
      pointsDifference: -5,
      xpDifference: 5,
      status: 'DIVERGENT',
    });
  });

  it('applies search and divergent filtering with accurate count', async () => {
    const searched = await harness
      .get('/admin/reconciliation?search=points-only', adminSession)
      .expect(200);
    expect((searched.body as ReconciliationPage).items).toEqual([
      expect.objectContaining({ participantId: participantIds.pointsOnly }),
    ]);

    const divergent = await harness
      .get('/admin/reconciliation?filter=divergent', adminSession)
      .expect(200);
    const page = divergent.body as ReconciliationPage;
    expect(page.meta.total).toBe(3);
    expect(page.items.map((item) => item.participantId)).toEqual(
      expect.arrayContaining([
        participantIds.pointsOnly,
        participantIds.xpOnly,
        participantIds.both,
      ]),
    );
  });

  it('paginates with stable ordering and no duplicate rows', async () => {
    const first = await harness
      .get('/admin/reconciliation?page=1&limit=2', adminSession)
      .expect(200);
    const repeated = await harness
      .get('/admin/reconciliation?page=1&limit=2', adminSession)
      .expect(200);
    const second = await harness
      .get('/admin/reconciliation?page=2&limit=2', adminSession)
      .expect(200);
    const firstIds = (first.body as ReconciliationPage).items.map(
      (item) => item.participantId,
    );
    const repeatedIds = (repeated.body as ReconciliationPage).items.map(
      (item) => item.participantId,
    );
    const secondIds = (second.body as ReconciliationPage).items.map(
      (item) => item.participantId,
    );
    expect(repeatedIds).toEqual(firstIds);
    expect(secondIds).not.toEqual(expect.arrayContaining(firstIds));
  });

  it('uses the same divergent total in summary and dashboard', async () => {
    const [summary, dashboard] = await Promise.all([
      harness.get('/admin/reconciliation/summary', adminSession).expect(200),
      harness.get('/admin/dashboard', adminSession).expect(200),
    ]);
    const summaryBody = summary.body as { divergentParticipants: number };
    expect(summaryBody).toEqual({ divergentParticipants: 3 });
    expect(dashboard.body as unknown).toMatchObject({
      reconciliation: summaryBody,
    });
  });

  it('is admin-only and read-only', async () => {
    const before = await Promise.all([
      harness.prisma.user.findMany({
        where: { id: { in: Object.values(participantIds) } },
        orderBy: { id: 'asc' },
      }),
      harness.prisma.pointEvent.count(),
    ]);
    await harness.get('/admin/reconciliation', participantSession).expect(403);
    await request(harness.app.getHttpServer())
      .get('/admin/reconciliation')
      .expect(401);
    await harness.get('/admin/reconciliation', adminSession).expect(200);
    const after = await Promise.all([
      harness.prisma.user.findMany({
        where: { id: { in: Object.values(participantIds) } },
        orderBy: { id: 'asc' },
      }),
      harness.prisma.pointEvent.count(),
    ]);
    expect(after).toEqual(before);
  });

  it('validates filters and returns 404 for an unknown participant', async () => {
    await harness
      .get('/admin/reconciliation?filter=consistent', adminSession)
      .expect(400);
    await harness
      .get('/admin/participants/missing/reconciliation', adminSession)
      .expect(404);
  });

  it('confirms an audited ledger-only compensation and replays without duplication', async () => {
    const participantId = participantIds.pointsOnly;
    const idempotencyKey = randomUUID();
    const reason = 'Correcao de divergencia confirmada no atendimento';
    const userBefore = await harness.prisma.user.findUniqueOrThrow({
      where: { id: participantId },
      select: { points: true, xp: true },
    });

    const first = await harness
      .post(
        `/admin/participants/${participantId}/reconciliation/confirm`,
        adminSession,
      )
      .send({ reason: `  ${reason}  `, idempotencyKey })
      .expect(201);
    const firstBody = first.body as ReconciliationConfirmation;
    expect(firstBody).toMatchObject({
      before: { pointsDifference: 2, xpDifference: 0, status: 'DIVERGENT' },
      after: { pointsDifference: 0, xpDifference: 0, status: 'CONSISTENT' },
      pointEvent: {
        pointsDelta: 2,
        xpDelta: 0,
        source: PointEventSource.ADMIN_ADJUST,
        origin: 'RECONCILIATION_COMPENSATION',
      },
      auditEvent: { operation: 'RECONCILIATION_ADJUSTMENT_CONFIRMED' },
      replayed: false,
    });

    const replay = await harness
      .post(
        `/admin/participants/${participantId}/reconciliation/confirm`,
        adminSession,
      )
      .send({ reason, idempotencyKey })
      .expect(201);
    expect(replay.body as ReconciliationConfirmation).toMatchObject({
      replayed: true,
      pointEvent: { id: firstBody.pointEvent.id },
      auditEvent: { id: firstBody.auditEvent.id },
    });
    await harness
      .post(
        `/admin/participants/${participantId}/reconciliation/confirm`,
        adminSession,
      )
      .send({
        reason: 'Outro motivo operacional para a mesma chave',
        idempotencyKey,
      })
      .expect(409);

    expect(
      await harness.prisma.user.findUniqueOrThrow({
        where: { id: participantId },
        select: { points: true, xp: true },
      }),
    ).toEqual(userBefore);
    expect(
      await harness.prisma.pointEvent.count({ where: { idempotencyKey } }),
    ).toBe(1);
    expect(
      await harness.prisma.adminAuditEvent.count({
        where: { id: firstBody.auditEvent.id, participantId },
      }),
    ).toBe(1);
    await expectDetail('pointsOnly', {
      pointsDifference: 0,
      xpDifference: 0,
      status: 'CONSISTENT',
    });
    const history = await harness
      .get(`/admin/participants/${participantId}/point-events`, adminSession)
      .expect(200);
    const historyBody = history.body as {
      items: Array<{ id: string; origin: string }>;
    };
    expect(historyBody.items).toContainEqual(
      expect.objectContaining({
        id: firstBody.pointEvent.id,
        origin: 'RECONCILIATION_COMPENSATION',
      }),
    );
  });

  it('serializes concurrent opposite-signed compensation into semantic events', async () => {
    const participantId = participantIds.both;
    const idempotencyKey = randomUUID();
    const body = {
      reason: 'Correcao concorrente confirmada pelo suporte',
      idempotencyKey,
    };
    const userBefore = await harness.prisma.user.findUniqueOrThrow({
      where: { id: participantId },
      select: { points: true, xp: true },
    });

    const responses = await Promise.all([
      harness
        .post(
          `/admin/participants/${participantId}/reconciliation/confirm`,
          adminSession,
        )
        .send(body),
      harness
        .post(
          `/admin/participants/${participantId}/reconciliation/confirm`,
          adminSession,
        )
        .send(body),
    ]);

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(
      responses
        .map(
          (response) => (response.body as ReconciliationConfirmation).replayed,
        )
        .sort(),
    ).toEqual([false, true]);
    expect(
      await harness.prisma.pointEvent.count({ where: { idempotencyKey } }),
    ).toBe(1);
    const first = responses.find(
      (response) => !(response.body as ReconciliationConfirmation).replayed,
    );
    const firstBody = first?.body as ReconciliationConfirmation;
    expect(firstBody.pointEvents).toEqual([
      expect.objectContaining({
        pointsDelta: -5,
        xpDelta: 0,
        source: PointEventSource.ADMIN_ADJUST,
      }),
      expect.objectContaining({
        pointsDelta: 0,
        xpDelta: 5,
        source: PointEventSource.ADMIN_ADJUST,
      }),
    ]);
    expect(
      await harness.prisma.pointEvent.count({
        where: { auditEventId: firstBody.auditEvent.id },
      }),
    ).toBe(2);
    const linkedIds = firstBody.pointEvents.map((event) => event.id);
    const persistedAudit =
      await harness.prisma.adminAuditEvent.findUniqueOrThrow({
        where: { id: firstBody.auditEvent.id },
        select: { after: true, metadata: true },
      });
    expect(persistedAudit.after).toMatchObject({ pointEventIds: linkedIds });
    expect(persistedAudit.metadata).toEqual({ pointEventIds: linkedIds });
    expect(JSON.stringify(persistedAudit)).not.toMatch(
      /cookie|authorization|csrf|password|jwt|token|code/i,
    );
    expect(
      await harness.prisma.user.findUniqueOrThrow({
        where: { id: participantId },
        select: { points: true, xp: true },
      }),
    ).toEqual(userBefore);
  });

  it('protects confirmation and rejects consistent participants', async () => {
    const path = `/admin/participants/${participantIds.noEvents}/reconciliation/confirm`;
    const body = {
      reason: 'Tentativa explicita de reconciliacao administrativa',
      idempotencyKey: randomUUID(),
    };
    await harness.post(path, participantSession).send(body).expect(403);
    await request(harness.app.getHttpServer())
      .post(path)
      .send(body)
      .expect(401);
    await harness.post(path, adminSession).send(body).expect(409);
  });

  async function expectDetail(
    key: string,
    expected: Partial<ReconciliationItem>,
  ) {
    const response = await harness
      .get(
        `/admin/participants/${participantIds[key]}/reconciliation`,
        adminSession,
      )
      .expect(200);
    expect(response.body as ReconciliationItem).toMatchObject(expected);
  }
});

function event(
  userId: string,
  points: number,
  xpDelta: number,
  source: PointEventSource,
) {
  return {
    userId,
    points,
    xpDelta,
    source,
    redemptionMethod:
      source === PointEventSource.ACTION_REDEEM
        ? ActionRedemptionMethod.LEGACY_UNKNOWN
        : null,
    kind:
      points < 0 || (points === 0 && xpDelta < 0)
        ? PointEventKind.DEBIT
        : PointEventKind.CREDIT,
  };
}
