import { PointEventSource, UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AdminE2eHarness } from './support/admin-e2e-harness';
import type { AuthSession } from './support/admin-e2e-harness';

type AdjustmentResponse = {
  before: { points: number; xp: number };
  after: { points: number; xp: number };
  pointEvent: { id: string };
  auditEvent: { id: string };
  replayed: boolean;
};

type ReversalResponse = AdjustmentResponse & {
  pointEvent: AdjustmentResponse['pointEvent'] & {
    reversalOfPointEventId: string;
  };
};

type PointEventHistoryResponse = {
  items: Array<{
    id: string;
    reversalOfPointEventId: string | null;
    reversalPointEventId: string | null;
  }>;
};

describe('Admin adjustments (e2e)', () => {
  let harness: AdminE2eHarness;
  let adminSession: AuthSession;
  let participantSession: AuthSession;
  let admin: { id: string };
  let participant: { id: string };

  beforeAll(async () => {
    harness = await AdminE2eHarness.create();
    const suffix = randomUUID();
    [admin, participant] = await Promise.all([
      harness.prisma.user.create({
        data: {
          name: `Adjustment admin ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 1),
          email: `adjustment-admin-${suffix}@example.test`,
          role: UserRole.ADMIN,
        },
      }),
      harness.prisma.user.create({
        data: {
          name: `Adjustment participant ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 2),
          email: `adjustment-participant-${suffix}@example.test`,
          points: 100,
          xp: 50,
          level: 7,
        },
      }),
    ]);
    const users = await harness.prisma.user.findMany({
      where: { id: { in: [admin.id, participant.id] } },
      select: { id: true, cpf: true, email: true },
    });
    const adminCredentials = users.find(({ id }) => id === admin.id)!;
    const participantCredentials = users.find(
      ({ id }) => id === participant.id,
    )!;
    adminSession = await harness.loginLegacy(
      adminCredentials.cpf,
      adminCredentials.email,
    );
    participantSession = await harness.loginLegacy(
      participantCredentials.cpf,
      participantCredentials.email,
    );
  });

  afterAll(async () => {
    if (harness) await harness.close();
  });

  it('applies once, persists both ledgers and returns an identical replay', async () => {
    const idempotencyKey = randomUUID();
    const body = {
      pointsDelta: 10,
      xpDelta: 5,
      reason: 'Correcao operacional confirmada',
      idempotencyKey,
    };

    const first = await harness
      .post(`/admin/participants/${participant.id}/adjustments`, adminSession)
      .send(body)
      .expect(201);
    const replay = await harness
      .post(`/admin/participants/${participant.id}/adjustments`, adminSession)
      .send(body)
      .expect(201);
    const firstBody = first.body as AdjustmentResponse;
    const replayBody = replay.body as AdjustmentResponse;

    expect(first.body).toMatchObject({
      before: { points: 100, xp: 50 },
      after: { points: 110, xp: 55 },
      pointEvent: {
        pointsDelta: 10,
        xpDelta: 5,
        source: PointEventSource.ADMIN_GRANT,
      },
      replayed: false,
    });
    expect(replayBody).toMatchObject({
      before: firstBody.before,
      after: firstBody.after,
      pointEvent: { id: firstBody.pointEvent.id },
      auditEvent: { id: firstBody.auditEvent.id },
      replayed: true,
    });
    const persisted = await harness.prisma.user.findUniqueOrThrow({
      where: { id: participant.id },
      select: { points: true, xp: true, level: true },
    });
    expect(persisted).toEqual({ points: 110, xp: 55, level: 7 });
    expect(
      await harness.prisma.pointEvent.count({ where: { idempotencyKey } }),
    ).toBe(1);
    expect(
      await harness.prisma.adminAuditEvent.count({
        where: { id: firstBody.auditEvent.id },
      }),
    ).toBe(1);
  });

  it('returns a public conflict for changed content under the same key', async () => {
    const idempotencyKey = randomUUID();
    const base = {
      pointsDelta: 1,
      xpDelta: 0,
      reason: 'Primeira correcao operacional',
      idempotencyKey,
    };
    await harness
      .post(`/admin/participants/${participant.id}/adjustments`, adminSession)
      .send(base)
      .expect(201);
    const conflict = await harness
      .post(`/admin/participants/${participant.id}/adjustments`, adminSession)
      .send({ ...base, pointsDelta: 2 })
      .expect(409);

    expect(JSON.stringify(conflict.body)).not.toMatch(/Prisma|P2002|database/i);
  });

  it('hides admin targets and rejects negative balances without ledgers', async () => {
    const countBefore = await harness.prisma.pointEvent.count();
    await harness
      .post(`/admin/participants/${admin.id}/adjustments`, adminSession)
      .send({
        pointsDelta: 1,
        xpDelta: 0,
        reason: 'Tentativa contra alvo administrativo',
        idempotencyKey: randomUUID(),
      })
      .expect(404);
    await harness
      .post(`/admin/participants/${participant.id}/adjustments`, adminSession)
      .send({
        pointsDelta: -1000,
        xpDelta: 0,
        reason: 'Debito maior que o saldo disponivel',
        idempotencyKey: randomUUID(),
      })
      .expect(400);
    expect(await harness.prisma.pointEvent.count()).toBe(countBefore);
  });

  it('allows one effective result for concurrent same-key requests', async () => {
    const idempotencyKey = randomUUID();
    const body = {
      pointsDelta: 3,
      xpDelta: 2,
      reason: 'Ajuste concorrente com mesma intencao',
      idempotencyKey,
    };
    const responses = await Promise.all([
      harness
        .post(`/admin/participants/${participant.id}/adjustments`, adminSession)
        .send(body),
      harness
        .post(`/admin/participants/${participant.id}/adjustments`, adminSession)
        .send(body),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([201, 201]);
    expect(
      responses.map(({ body }) => (body as AdjustmentResponse).replayed).sort(),
    ).toEqual([false, true]);
    expect(
      await harness.prisma.pointEvent.count({ where: { idempotencyKey } }),
    ).toBe(1);
  });

  it('serializes independent debits so stale balances cannot both win', async () => {
    const suffix = randomUUID();
    const target = await harness.prisma.user.create({
      data: {
        name: `Concurrent debit ${suffix}`,
        cpf: harness.uniqueCpf(suffix, 3),
        email: `concurrent-debit-${suffix}@example.test`,
        points: 5,
      },
    });
    const makeBody = () => ({
      pointsDelta: -4,
      xpDelta: 0,
      reason: 'Debito concorrente independente validado',
      idempotencyKey: randomUUID(),
    });

    const responses = await Promise.all([
      harness
        .post(`/admin/participants/${target.id}/adjustments`, adminSession)
        .send(makeBody()),
      harness
        .post(`/admin/participants/${target.id}/adjustments`, adminSession)
        .send(makeBody()),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 400]);
    await expect(
      harness.prisma.user.findUniqueOrThrow({ where: { id: target.id } }),
    ).resolves.toMatchObject({ points: 1 });
    expect(
      await harness.prisma.pointEvent.count({ where: { userId: target.id } }),
    ).toBe(1);
  });

  it('rolls back the provisional balance when audit persistence fails', async () => {
    const suffix = randomUUID();
    const target = await harness.prisma.user.create({
      data: {
        name: `Audit rollback ${suffix}`,
        cpf: harness.uniqueCpf(suffix, 4),
        email: `audit-rollback-${suffix}@example.test`,
        points: 20,
        xp: 10,
      },
    });
    const idempotencyKey = randomUUID();
    await harness.prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS "AdminAuditEvent_fail_insert_test" ON "AdminAuditEvent"',
    );
    await harness.prisma.$executeRawUnsafe(
      'CREATE TRIGGER "AdminAuditEvent_fail_insert_test" BEFORE INSERT ON "AdminAuditEvent" FOR EACH ROW EXECUTE FUNCTION reject_immutable_ledger_change()',
    );
    try {
      const response = await harness
        .post(`/admin/participants/${target.id}/adjustments`, adminSession)
        .send({
          pointsDelta: 5,
          xpDelta: 2,
          reason: 'Falha de auditoria deve reverter tudo',
          idempotencyKey,
        })
        .expect(500);
      expect(JSON.stringify(response.body)).not.toMatch(
        /immutable|Prisma|database/i,
      );
    } finally {
      await harness.prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS "AdminAuditEvent_fail_insert_test" ON "AdminAuditEvent"',
      );
    }

    await expect(
      harness.prisma.user.findUniqueOrThrow({ where: { id: target.id } }),
    ).resolves.toMatchObject({ points: 20, xp: 10 });
    expect(
      await harness.prisma.pointEvent.count({ where: { idempotencyKey } }),
    ).toBe(0);
    expect(
      await harness.prisma.adminAuditEvent.count({
        where: { participantId: target.id },
      }),
    ).toBe(0);
  });

  it('forbids participant access', async () => {
    await harness
      .post(
        `/admin/participants/${participant.id}/adjustments`,
        participantSession,
      )
      .send({
        pointsDelta: 1,
        xpDelta: 0,
        reason: 'Tentativa sem papel administrativo',
        idempotencyKey: randomUUID(),
      })
      .expect(403);
  });

  it('reverses an adjustment once, preserves the original and replays stably', async () => {
    const suffix = randomUUID();
    const target = await harness.prisma.user.create({
      data: {
        name: `Reversal target ${suffix}`,
        cpf: harness.uniqueCpf(suffix, 5),
        email: `reversal-${suffix}@example.test`,
        points: 40,
        xp: 20,
      },
    });
    const adjustment = await harness
      .post(`/admin/participants/${target.id}/adjustments`, adminSession)
      .send({
        pointsDelta: 10,
        xpDelta: 5,
        reason: 'Credito administrativo para posterior estorno',
        idempotencyKey: randomUUID(),
      })
      .expect(201);
    const original = adjustment.body as AdjustmentResponse;
    const body = {
      reason: 'Estorno administrativo integral confirmado',
      idempotencyKey: randomUUID(),
    };

    const first = await harness
      .post(
        `/admin/point-events/${original.pointEvent.id}/reverse`,
        adminSession,
      )
      .send(body)
      .expect(201);
    const replay = await harness
      .post(
        `/admin/point-events/${original.pointEvent.id}/reverse`,
        adminSession,
      )
      .send(body)
      .expect(201);
    const firstBody = first.body as ReversalResponse;
    const replayBody = replay.body as ReversalResponse;

    expect(firstBody).toMatchObject({
      before: { points: 50, xp: 25 },
      after: { points: 40, xp: 20 },
      pointEvent: {
        pointsDelta: -10,
        xpDelta: -5,
        source: PointEventSource.ADMIN_ADJUST,
        reversalOfPointEventId: original.pointEvent.id,
      },
      replayed: false,
    });
    expect(replayBody).toMatchObject({
      before: firstBody.before,
      after: firstBody.after,
      pointEvent: { id: firstBody.pointEvent.id },
      auditEvent: { id: firstBody.auditEvent.id },
      replayed: true,
    });
    await harness
      .post(
        `/admin/point-events/${original.pointEvent.id}/reverse`,
        adminSession,
      )
      .send({ ...body, reason: 'Conteudo diferente para a mesma chave' })
      .expect(409);
    await harness
      .post(
        `/admin/point-events/${firstBody.pointEvent.id}/reverse`,
        adminSession,
      )
      .send({
        reason: 'Tentativa proibida de estornar uma compensacao',
        idempotencyKey: randomUUID(),
      })
      .expect(409);
    await expect(
      harness.prisma.user.findUniqueOrThrow({ where: { id: target.id } }),
    ).resolves.toMatchObject({ points: 40, xp: 20 });
    await expect(
      harness.prisma.pointEvent.findUniqueOrThrow({
        where: { id: original.pointEvent.id },
      }),
    ).resolves.toMatchObject({ points: 10, xpDelta: 5, reversedEventId: null });

    const history = await harness
      .get(`/admin/participants/${target.id}/point-events`, adminSession)
      .expect(200);
    const historyBody = history.body as PointEventHistoryResponse;
    expect(historyBody.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: original.pointEvent.id,
          reversalPointEventId: firstBody.pointEvent.id,
          reversalOfPointEventId: null,
        }),
        expect.objectContaining({
          id: firstBody.pointEvent.id,
          reversalPointEventId: null,
          reversalOfPointEventId: original.pointEvent.id,
        }),
      ]),
    );
  });

  it('allows only one effective reversal under concurrent different keys', async () => {
    const suffix = randomUUID();
    const target = await harness.prisma.user.create({
      data: {
        name: `Concurrent reversal ${suffix}`,
        cpf: harness.uniqueCpf(suffix, 6),
        email: `concurrent-reversal-${suffix}@example.test`,
        points: 30,
        xp: 10,
      },
    });
    const adjustment = await harness
      .post(`/admin/participants/${target.id}/adjustments`, adminSession)
      .send({
        pointsDelta: 4,
        xpDelta: 2,
        reason: 'Credito para validar estorno concorrente',
        idempotencyKey: randomUUID(),
      })
      .expect(201);
    const originalId = (adjustment.body as AdjustmentResponse).pointEvent.id;
    const responses = await Promise.all([
      harness
        .post(`/admin/point-events/${originalId}/reverse`, adminSession)
        .send({
          reason: 'Primeira tentativa concorrente de estorno',
          idempotencyKey: randomUUID(),
        }),
      harness
        .post(`/admin/point-events/${originalId}/reverse`, adminSession)
        .send({
          reason: 'Segunda tentativa concorrente de estorno',
          idempotencyKey: randomUUID(),
        }),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(
      await harness.prisma.pointEvent.count({
        where: { reversedEventId: originalId },
      }),
    ).toBe(1);
    await expect(
      harness.prisma.user.findUniqueOrThrow({ where: { id: target.id } }),
    ).resolves.toMatchObject({ points: 30, xp: 10 });
  });

  it('rejects a reward movement and a reversal as ineligible', async () => {
    const rewardEvent = await harness.prisma.pointEvent.create({
      data: {
        userId: participant.id,
        points: -1,
        kind: 'DEBIT',
        source: PointEventSource.REWARD_REDEMPTION,
      },
    });
    await harness
      .post(`/admin/point-events/${rewardEvent.id}/reverse`, adminSession)
      .send({
        reason: 'Tentativa de estorno de origem nao administrativa',
        idempotencyKey: randomUUID(),
      })
      .expect(409);
  });
});
