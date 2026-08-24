import {
  ActionRedemptionMethod,
  ActionType,
  PointEventKind,
  PointEventSource,
  AuditEntityType,
  AuditOperation,
  RedemptionStatus,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Response } from 'supertest';
import { AdminE2eHarness, AuthSession } from './support/admin-e2e-harness';

type Page<T> = {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

describe('Admin participants (e2e)', () => {
  let harness: AdminE2eHarness;
  let adminSession: AuthSession;
  let firstSession: AuthSession;
  let admin: { id: string };
  let first: { id: string; cpf: string; email: string };
  let second: { id: string; cpf: string; email: string };
  let availableClaimCode: string;
  let availableClaimCodeId: string;
  let reusableCode: string;
  let directActionId: string;
  let pendingRedemptionId: string;
  let suffix: string;
  const userIds: string[] = [];
  const actionIds: string[] = [];
  const claimCodeIds: string[] = [];
  const rewardIds: string[] = [];

  beforeAll(async () => {
    harness = await AdminE2eHarness.create();
    suffix = randomUUID();
    reusableCode = `PARTICIPANTS-${suffix}`.toUpperCase();
    const users = await Promise.all([
      harness.prisma.user.create({
        data: {
          name: `Participants admin ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 1),
          email: `participants-admin-${suffix}@example.test`,
          role: UserRole.ADMIN,
          adminProfile: 'GENERAL',
        },
      }),
      harness.prisma.user.create({
        data: {
          name: `Participants Alpha ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 2),
          email: `participants-alpha-${suffix}@example.test`,
          points: 500,
          xp: 50,
        },
      }),
      harness.prisma.user.create({
        data: {
          name: `Participants Beta ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 3),
          email: `participants-beta-${suffix}@example.test`,
          points: 500,
          xp: 60,
        },
      }),
    ]);
    [admin, first, second] = users;
    userIds.push(...users.map(({ id }) => id));

    const actions = await Promise.all([
      harness.prisma.action.create({
        data: {
          name: `Participants claim ${suffix}`,
          type: ActionType.CHECKIN,
          points: 11,
        },
      }),
      harness.prisma.action.create({
        data: {
          name: `Participants reusable ${suffix}`,
          type: ActionType.BONUS,
          code: reusableCode,
          points: 13,
          isCodeActive: true,
        },
      }),
      harness.prisma.action.create({
        data: {
          name: `Participants direct ${suffix}`,
          type: ActionType.DYNAMIC,
          points: 17,
        },
      }),
    ]);
    actionIds.push(...actions.map(({ id }) => id));
    directActionId = actions[2].id;

    availableClaimCode = claimCodeFor(suffix, 1);
    const claimCode = await harness.prisma.claimCode.create({
      data: { code: availableClaimCode, actionId: actions[0].id },
    });
    availableClaimCodeId = claimCode.id;
    claimCodeIds.push(claimCode.id);

    await harness.prisma.pointEvent.createMany({
      data: [
        {
          userId: second.id,
          actionId: actions[0].id,
          points: 11,
          kind: PointEventKind.CREDIT,
          source: PointEventSource.ACTION_REDEEM,
          redemptionMethod: ActionRedemptionMethod.LEGACY_UNKNOWN,
        },
        {
          userId: second.id,
          actionId: actions[1].id,
          points: 13,
          kind: PointEventKind.CREDIT,
          source: PointEventSource.ACTION_REDEEM,
          redemptionMethod: ActionRedemptionMethod.LEGACY_UNKNOWN,
        },
      ],
    });

    const reward = await harness.prisma.reward.create({
      data: {
        name: `Participants reward ${suffix}`,
        costInPoints: 25,
        stock: 10,
      },
    });
    rewardIds.push(reward.id);
    const redemption = await harness.prisma.rewardRedemption.create({
      data: {
        userId: second.id,
        rewardId: reward.id,
        pointsSpent: 25,
        status: RedemptionStatus.PENDING,
      },
    });
    pendingRedemptionId = redemption.id;

    adminSession = await harness.loginLegacy(users[0].cpf, users[0].email);
    firstSession = await harness.loginLegacy(first.cpf, first.email);
    await harness.loginLegacy(second.cpf, second.email);
  });

  afterAll(async () => {
    if (harness) await harness.close();
  });

  it('searches and paginates participants and rejects admin details', async () => {
    const search = await harness
      .get(
        `/admin/participants?search=${encodeURIComponent(first.email)}&page=1&limit=1`,
        adminSession,
      )
      .expect(200);
    expect((search.body as Page<{ id: string }>).items).toEqual([
      expect.objectContaining({ id: first.id }),
    ]);

    const page1 = await harness
      .get(`/admin/participants?search=${suffix}&page=1&limit=1`, adminSession)
      .expect(200);
    const page2 = await harness
      .get(`/admin/participants?search=${suffix}&page=2&limit=1`, adminSession)
      .expect(200);
    const firstPage = page1.body as Page<{ id: string }>;
    const secondPage = page2.body as Page<{ id: string }>;
    expect(firstPage.meta).toEqual({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
    expect(secondPage.meta).toEqual({
      page: 2,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
    expect(firstPage.items[0].id).not.toBe(secondPage.items[0].id);
    await harness
      .get(`/admin/participants/${admin.id}`, adminSession)
      .expect(404);
  });

  it('returns participant detail and independent paginated histories', async () => {
    const detail = await harness
      .get(`/admin/participants/${second.id}`, adminSession)
      .expect(200);
    expect(detail.body).toMatchObject({
      id: second.id,
      cpf: second.cpf,
      email: second.email,
      isActive: true,
      points: 500,
      xp: 60,
      level: 1,
      // Jest asymmetric matchers are intentionally untyped in expected objects.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      counts: expect.objectContaining({ movements: 2, actionRedemptions: 2 }),
    });
    expect(typeof (detail.body as { lastLoginAt: unknown }).lastLoginAt).toBe(
      'string',
    );

    const eventPage1 = await harness
      .get(
        `/admin/participants/${second.id}/point-events?source=action_redeem&page=1&limit=1`,
        adminSession,
      )
      .expect(200);
    const eventPage2 = await harness
      .get(
        `/admin/participants/${second.id}/point-events?source=action_redeem&page=2&limit=1`,
        adminSession,
      )
      .expect(200);
    expect((eventPage1.body as Page<{ id: string }>).meta).toEqual({
      page: 1,
      limit: 1,
      total: 2,
      totalPages: 2,
    });
    expect((eventPage1.body as Page<{ id: string }>).items[0].id).not.toBe(
      (eventPage2.body as Page<{ id: string }>).items[0].id,
    );

    const redemptions = await harness
      .get(
        `/admin/participants/${second.id}/reward-redemptions?status=pending&page=1&limit=1`,
        adminSession,
      )
      .expect(200);
    expect(redemptions.body).toMatchObject({
      items: [expect.objectContaining({ id: pendingRedemptionId })],
      meta: { page: 1, limit: 1, total: 1 },
    });
  });

  it('invalidates a disabled participant session and allows reactivation', async () => {
    await harness
      .patch(`/admin/participants/${first.id}/status`, adminSession)
      .send({
        isActive: false,
        reason: 'Desativacao administrativa do participante',
      })
      .expect(200)
      .expect(({ body }: Response) =>
        expect(body).toMatchObject({ isActive: false }),
      );
    await harness.get('/users/me', firstSession).expect(401);
    await harness
      .patch(`/admin/participants/${first.id}/status`, adminSession)
      .send({
        isActive: true,
        reason: 'Reativacao administrativa do participante',
      })
      .expect(200);
    firstSession = await harness.loginLegacy(first.cpf, first.email);
  });

  it('serializes concurrent participant status updates with one exact before snapshot', async () => {
    const auditFilter = {
      operation: AuditOperation.PARTICIPANT_STATUS_CHANGED,
      entityType: AuditEntityType.PARTICIPANT,
      entityId: first.id,
    } as const;
    const auditCountBefore = await harness.prisma.adminAuditEvent.count({
      where: auditFilter,
    });
    const responses = await Promise.all([
      harness
        .patch(`/admin/participants/${first.id}/status`, adminSession)
        .send({
          isActive: false,
          reason: 'Primeira desativacao concorrente do participante',
        }),
      harness
        .patch(`/admin/participants/${first.id}/status`, adminSession)
        .send({
          isActive: false,
          reason: 'Segunda desativacao concorrente do participante',
        }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    const events = await harness.prisma.adminAuditEvent.findMany({
      where: auditFilter,
      orderBy: { createdAt: 'desc' },
    });
    expect(events).toHaveLength(auditCountBefore + 1);
    expect(events[0]).toMatchObject({
      before: { id: first.id, isActive: true },
      after: { id: first.id, isActive: false },
    });

    await harness
      .patch(`/admin/participants/${first.id}/status`, adminSession)
      .send({
        isActive: true,
        reason: 'Reativacao apos teste concorrente do participante',
      })
      .expect(200);
    firstSession = await harness.loginLegacy(first.cpf, first.email);
  });

  it('records exact redemption methods in filtered participant history', async () => {
    await harness
      .post('/actions/redeem-code', firstSession)
      .send({ code: availableClaimCode })
      .expect(201);
    await harness
      .post('/actions/redeem-code', firstSession)
      .send({ code: reusableCode })
      .expect(201);
    await harness
      .post(`/actions/${directActionId}/redeem`, firstSession)
      .expect(201);

    const response = await harness
      .get(
        `/admin/participants/${first.id}/point-events?source=action_redeem&page=1&limit=10`,
        adminSession,
      )
      .expect(200);
    const events = (
      response.body as Page<{
        redemptionMethod: ActionRedemptionMethod;
        claimCode: { id: string } | null;
        xpDelta: number;
        origin: string;
      }>
    ).items;
    const claim = events.find(
      ({ redemptionMethod }) =>
        redemptionMethod === ActionRedemptionMethod.CLAIM_CODE,
    );
    const reusable = events.find(
      ({ redemptionMethod }) =>
        redemptionMethod === ActionRedemptionMethod.REUSABLE_CODE,
    );
    const direct = events.find(
      ({ redemptionMethod }) =>
        redemptionMethod === ActionRedemptionMethod.DIRECT,
    );
    expect(claim).toMatchObject({ xpDelta: 11, origin: 'UNIQUE_CODE' });
    expect(claim?.claimCode?.id).toBe(availableClaimCodeId);
    expect(reusable).toMatchObject({
      claimCode: null,
      xpDelta: 13,
      origin: 'REUSABLE_CODE',
    });
    expect(direct).toMatchObject({
      claimCode: null,
      xpDelta: 17,
      origin: 'DIRECT_ACTION',
    });
  });
});

function claimCodeFor(suffix: string, discriminator: number) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const source = `${discriminator}${suffix}`.replace(/-/g, '').toUpperCase();
  const encoded = Array.from({ length: 8 }, (_, index) =>
    alphabet.charAt(source.charCodeAt(index % source.length) % alphabet.length),
  ).join('');
  return `${encoded.slice(0, 4)}-${encoded.slice(4)}`;
}
