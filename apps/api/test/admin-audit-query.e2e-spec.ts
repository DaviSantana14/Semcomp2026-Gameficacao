import {
  AuditActorType,
  AuditEntityType,
  AuditOperation,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AdminE2eHarness, AuthSession } from './support/admin-e2e-harness';
import { hasDisposableTestDatabaseConfiguration } from './support/e2e-database-cleanup';

const describeDisposable = hasDisposableTestDatabaseConfiguration()
  ? describe
  : describe.skip;

type AuditPage = {
  items: Array<{
    id: string;
    actorAdminId: string | null;
    participantId: string | null;
    operation: AuditOperation;
    entityType: AuditEntityType;
    entityId: string;
    reason: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    metadata: Record<string, unknown> | null;
    requestId: string;
    createdAt: string;
  }>;
  meta: { page: number; limit: number; total: number; totalPages: number };
};

describeDisposable('Admin audit query (e2e)', () => {
  let harness: AdminE2eHarness;
  let adminSession: AuthSession;
  let participantSession: AuthSession;
  let adminId: string;
  let participantId: string;

  const older = new Date('2026-07-14T10:00:00.000Z');
  const tied = new Date('2026-07-15T10:00:00.000Z');

  beforeAll(async () => {
    harness = await AdminE2eHarness.create();
    const suffix = randomUUID();
    const [admin, participant, otherParticipant] = await Promise.all([
      harness.prisma.user.create({
        data: {
          name: `Audit query admin ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 1),
          email: `audit-query-admin-${suffix}@example.test`,
          role: UserRole.ADMIN,
        },
      }),
      harness.prisma.user.create({
        data: {
          name: `Audit query participant ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 2),
          email: `audit-query-participant-${suffix}@example.test`,
        },
      }),
      harness.prisma.user.create({
        data: {
          name: `Audit query other ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 3),
          email: `audit-query-other-${suffix}@example.test`,
        },
      }),
    ]);
    adminId = admin.id;
    participantId = participant.id;

    await harness.prisma.adminAuditEvent.createMany({
      data: [
        auditEvent({
          id: 'audit-query-a',
          actorAdminId: admin.id,
          participantId: participant.id,
          operation: AuditOperation.PARTICIPANT_STATUS_CHANGED,
          entityType: AuditEntityType.PARTICIPANT,
          entityId: participant.id,
          requestId: 'request-status',
          createdAt: tied,
        }),
        auditEvent({
          id: 'audit-query-b',
          actorAdminId: admin.id,
          participantId: participant.id,
          operation: AuditOperation.PARTICIPANT_BALANCE_ADJUSTED,
          entityType: AuditEntityType.POINT_EVENT,
          entityId: 'point-query-1',
          requestId: 'request-adjustment',
          createdAt: tied,
        }),
        auditEvent({
          id: 'audit-query-c',
          actorAdminId: admin.id,
          participantId: participant.id,
          operation: AuditOperation.PARTICIPANT_BALANCE_ADJUSTED,
          entityType: AuditEntityType.POINT_EVENT,
          entityId: 'point-query-2',
          requestId: 'request-old-adjustment',
          createdAt: older,
        }),
        auditEvent({
          id: 'audit-query-other',
          actorAdminId: admin.id,
          participantId: otherParticipant.id,
          operation: AuditOperation.PARTICIPANT_BALANCE_ADJUSTED,
          entityType: AuditEntityType.POINT_EVENT,
          entityId: 'point-query-other',
          requestId: 'request-other',
          createdAt: tied,
        }),
      ],
    });

    [adminSession, participantSession] = await Promise.all([
      harness.login(admin.cpf, admin.email),
      harness.login(participant.cpf, participant.email),
    ]);
  });

  afterAll(async () => {
    if (harness) await harness.close();
  });

  it('requires authentication and the administrator role', async () => {
    await request(harness.app.getHttpServer())
      .get('/admin/audit-events')
      .expect(401);
    await harness.get('/admin/audit-events', participantSession).expect(403);
    await request(harness.app.getHttpServer())
      .get(`/admin/participants/${participantId}/audit-events`)
      .expect(401);
    await harness
      .get(
        `/admin/participants/${participantId}/audit-events`,
        participantSession,
      )
      .expect(403);
  });

  it('combines actor, participant, operation, entity, request and date filters', async () => {
    const response = await harness
      .get(
        `/admin/audit-events?actorType=ADMIN&actorAdminId=${adminId}` +
          `&participantId=${participantId}` +
          '&operation=PARTICIPANT_BALANCE_ADJUSTED' +
          '&entityType=POINT_EVENT&entityId=point-query-1' +
          '&requestId=request-adjustment' +
          '&from=2026-07-15T00%3A00%3A00.000Z' +
          '&to=2026-07-15T23%3A59%3A59.999Z',
        adminSession,
      )
      .expect(200);

    expect(response.body as AuditPage).toMatchObject({
      items: [
        {
          id: 'audit-query-b',
          actorAdminId: adminId,
          participantId,
          requestId: 'request-adjustment',
        },
      ],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    const event = (response.body as AuditPage).items[0];
    expect(Object.keys(event).sort()).toEqual(
      [
        'actorAdminId',
        'actorType',
        'after',
        'before',
        'createdAt',
        'entityId',
        'entityType',
        'id',
        'metadata',
        'operation',
        'participantId',
        'reason',
        'requestId',
      ].sort(),
    );
    expect(event).toMatchObject({
      reason: 'Operacao administrativa registrada para consulta',
      before: { isActive: true },
      after: { isActive: false },
      metadata: { pointEventId: 'point-query-1' },
    });
    const serialized = JSON.stringify(event).toLowerCase();
    for (const forbidden of [
      'cookie',
      'authorization',
      'csrftoken',
      'password',
      'passwordhash',
      'headers',
      'requestbody',
      'reusablecode',
      'stack',
      'prisma',
      'access_token',
      'bearer ',
      'full-unique-code',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('paginates a stable createdAt/id order without duplicate rows', async () => {
    const first = await harness
      .get(
        `/admin/audit-events?participantId=${participantId}&page=1&limit=2`,
        adminSession,
      )
      .expect(200);
    const second = await harness
      .get(
        `/admin/audit-events?participantId=${participantId}&page=2&limit=2`,
        adminSession,
      )
      .expect(200);
    const firstPage = first.body as AuditPage;
    const secondPage = second.body as AuditPage;

    expect(firstPage.items.map(({ id }) => id)).toEqual([
      'audit-query-b',
      'audit-query-a',
    ]);
    expect(secondPage.items.map(({ id }) => id)).toEqual(['audit-query-c']);
    expect(
      new Set([...firstPage.items, ...secondPage.items].map(({ id }) => id)),
    ).toHaveProperty('size', 3);
  });

  it('scopes participant timelines and validates date ranges', async () => {
    const timeline = await harness
      .get(
        `/admin/participants/${participantId}/audit-events?operation=PARTICIPANT_BALANCE_ADJUSTED`,
        adminSession,
      )
      .expect(200);

    expect((timeline.body as AuditPage).items).toHaveLength(2);
    expect(
      (timeline.body as AuditPage).items.every(
        (event) => event.participantId === participantId,
      ),
    ).toBe(true);
    expect((timeline.body as AuditPage).items.map(({ id }) => id)).toEqual([
      'audit-query-b',
      'audit-query-c',
    ]);

    const firstTimelinePage = await harness
      .get(
        `/admin/participants/${participantId}/audit-events?page=1&limit=1`,
        adminSession,
      )
      .expect(200);
    const secondTimelinePage = await harness
      .get(
        `/admin/participants/${participantId}/audit-events?page=2&limit=1`,
        adminSession,
      )
      .expect(200);
    expect((firstTimelinePage.body as AuditPage).items[0].id).toBe(
      'audit-query-b',
    );
    expect((secondTimelinePage.body as AuditPage).items[0].id).toBe(
      'audit-query-a',
    );
    expect((firstTimelinePage.body as AuditPage).meta).toEqual({
      page: 1,
      limit: 1,
      total: 3,
      totalPages: 3,
    });
    await harness
      .get(
        '/admin/audit-events?from=2026-07-16T00%3A00%3A00.000Z&to=2026-07-15T00%3A00%3A00.000Z',
        adminSession,
      )
      .expect(400);
  });
});

function auditEvent(overrides: {
  id: string;
  actorAdminId: string;
  participantId: string;
  operation: AuditOperation;
  entityType: AuditEntityType;
  entityId: string;
  requestId: string;
  createdAt: Date;
}) {
  return {
    actorType: AuditActorType.ADMIN,
    reason: 'Operacao administrativa registrada para consulta',
    before: { isActive: true },
    after: { isActive: false },
    metadata:
      overrides.id === 'audit-query-b'
        ? { pointEventId: 'point-query-1' }
        : undefined,
    ...overrides,
  };
}
