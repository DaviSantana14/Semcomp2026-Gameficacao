import { ActionRedemptionMethod, ActionType, UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Response } from 'supertest';
import { AdminE2eHarness, AuthSession } from './support/admin-e2e-harness';

type Page<T> = {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

describe('Admin actions and codes (e2e)', () => {
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

  it('creates and edits an action while preserving its redemption snapshot', async () => {
    const originalName = `Actions managed ${randomUUID()}`;
    const created = await harness
      .post('/actions', adminSession)
      .send({
        name: originalName,
        type: ActionType.BONUS,
        points: 23,
        isActive: true,
      })
      .expect(201);
    const id = (created.body as { id: string }).id;
    actionIds.push(id);

    await harness
      .post(`/actions/${id}/redeem`, secondSession)
      .expect(201)
      .expect(({ body }: Response) =>
        expect(body).toMatchObject({ awardedPoints: 23 }),
      );
    await harness
      .patch(`/admin/actions/${id}`, adminSession)
      .send({ name: `${originalName} edited`, points: 99, isActive: false })
      .expect(200)
      .expect(({ body }: Response) =>
        expect(body).toMatchObject({
          id,
          name: `${originalName} edited`,
          points: 99,
          isActive: false,
        }),
      );

    const event = await harness.prisma.pointEvent.findFirstOrThrow({
      where: { userId: secondId, actionId: id },
    });
    expect(event.points).toBe(23);
    expect(event.redemptionMethod).toBe(ActionRedemptionMethod.DIRECT);
    await harness.post(`/actions/${id}/redeem`, firstSession).expect(400);
  });

  it('controls action and reusable-code activation independently', async () => {
    await harness
      .patch(`/admin/actions/${reusableActionId}`, adminSession)
      .send({ isActive: false, isCodeActive: true })
      .expect(200)
      .expect(({ body }: Response) =>
        expect(body).toMatchObject({ isActive: false, isCodeActive: true }),
      );
    await harness
      .patch(`/admin/actions/${reusableActionId}`, adminSession)
      .send({ isActive: true, isCodeActive: false })
      .expect(200);
    await harness
      .post('/actions/redeem-code', secondSession)
      .send({ code: reusableCode })
      .expect(400);
    await harness
      .patch(`/admin/actions/${reusableActionId}`, adminSession)
      .send({ isCodeActive: true })
      .expect(200);
  });

  it('generates, filters, toggles, and consumes unique claim codes', async () => {
    const created = await harness
      .post('/actions', adminSession)
      .send({
        name: `Actions generated ${suffix}`,
        type: ActionType.CHECKIN,
        points: 7,
      })
      .expect(201);
    const actionId = (created.body as { id: string }).id;
    actionIds.push(actionId);
    const generated = await harness
      .post(`/admin/actions/${actionId}/claim-codes/generate`, adminSession)
      .send({ quantity: 2 })
      .expect(201);
    const codes = (generated.body as { codes: string[] }).codes;
    expect(codes).toHaveLength(2);
    const rows = await harness.prisma.claimCode.findMany({
      where: { code: { in: codes } },
      orderBy: { code: 'asc' },
    });
    claimCodeIds.push(...rows.map(({ id }) => id));
    expect(rows).toHaveLength(2);

    await harness
      .patch(`/admin/claim-codes/${rows[0].id}/status`, adminSession)
      .send({ isActive: false })
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
      .send({ isActive: true })
      .expect(200);

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
    await harness
      .patch(`/admin/claim-codes/${rows[1].id}/status`, adminSession)
      .send({ isActive: true })
      .expect(409);
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
