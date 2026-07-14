import { RedemptionStatus, UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Response } from 'supertest';
import { AdminE2eHarness, AuthSession } from './support/admin-e2e-harness';

type Page<T> = {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

describe('Admin rewards (e2e)', () => {
  let harness: AdminE2eHarness;
  let adminSession: AuthSession;
  let participantSession: AuthSession;
  let participantId: string;
  const userIds: string[] = [];
  const rewardIds: string[] = [];

  beforeAll(async () => {
    harness = await AdminE2eHarness.create();
    const suffix = randomUUID();
    const [admin, participant] = await Promise.all([
      harness.prisma.user.create({
        data: {
          name: `Rewards admin ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 1),
          email: `rewards-admin-${suffix}@example.test`,
          role: UserRole.ADMIN,
        },
      }),
      harness.prisma.user.create({
        data: {
          name: `Rewards participant ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 2),
          email: `rewards-participant-${suffix}@example.test`,
          points: 500,
          xp: 60,
        },
      }),
    ]);
    userIds.push(admin.id, participant.id);
    participantId = participant.id;
    adminSession = await harness.login(admin.cpf, admin.email);
    participantSession = await harness.login(
      participant.cpf,
      participant.email,
    );
  });

  afterAll(async () => {
    if (harness) await harness.close();
  });

  it('creates, edits, hides, and preserves inactive rewards for admins', async () => {
    const suffix = randomUUID();
    const created = await harness
      .post('/rewards', adminSession)
      .send({
        name: `Rewards managed ${suffix}`,
        costInPoints: 40,
        stock: 3,
        isActive: true,
      })
      .expect(201);
    const rewardId = (created.body as { id: string }).id;
    rewardIds.push(rewardId);

    await harness
      .patch(`/rewards/${rewardId}`, adminSession)
      .send({ costInPoints: 45, stock: 4, isActive: false })
      .expect(200)
      .expect(({ body }: Response) =>
        expect(body).toMatchObject({
          id: rewardId,
          costInPoints: 45,
          stock: 4,
          isActive: false,
        }),
      );

    const catalog = await harness
      .get('/rewards', participantSession)
      .expect(200);
    expect(catalog.body as Array<{ id: string }>).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: rewardId })]),
    );
    const history = await harness
      .get(
        `/admin/rewards?search=${encodeURIComponent(suffix)}&status=inactive&page=1&limit=1`,
        adminSession,
      )
      .expect(200);
    expect(history.body as Page<unknown>).toMatchObject({
      items: [expect.objectContaining({ id: rewardId })],
      meta: { total: 1 },
    });
  });

  it('redeems and cancels with exact balances and restored stock', async () => {
    const rewardId = await createTransactionalReward();
    const before = await harness.prisma.user.findUniqueOrThrow({
      where: { id: participantId },
    });
    const response = await harness
      .post(`/rewards/${rewardId}/redeem`, participantSession)
      .expect(201)
      .expect(({ body }: Response) =>
        expect(body).toMatchObject({
          pointsSpent: 40,
          status: RedemptionStatus.PENDING,
        }),
      );
    const redemptionId = (response.body as { id: string }).id;
    const [afterRedeem, rewardAfterRedeem] = await Promise.all([
      harness.prisma.user.findUniqueOrThrow({ where: { id: participantId } }),
      harness.prisma.reward.findUniqueOrThrow({ where: { id: rewardId } }),
    ]);
    expect(afterRedeem.points).toBe(before.points - 40);
    expect(afterRedeem.xp).toBe(before.xp);
    expect(rewardAfterRedeem.stock).toBe(1);

    await harness
      .patch(`/admin/redemptions/${redemptionId}/cancel`, adminSession)
      .expect(200)
      .expect(({ body }: Response) =>
        expect(body).toMatchObject({ status: RedemptionStatus.CANCELLED }),
      );
    const [afterCancel, rewardAfterCancel, cancelled] = await Promise.all([
      harness.prisma.user.findUniqueOrThrow({ where: { id: participantId } }),
      harness.prisma.reward.findUniqueOrThrow({ where: { id: rewardId } }),
      harness.prisma.rewardRedemption.findUniqueOrThrow({
        where: { id: redemptionId },
      }),
    ]);
    expect(afterCancel.points).toBe(before.points);
    expect(afterCancel.xp).toBe(before.xp);
    expect(rewardAfterCancel.stock).toBe(2);
    expect(cancelled.status).toBe(RedemptionStatus.CANCELLED);
    await harness
      .patch(`/admin/redemptions/${redemptionId}/cancel`, adminSession)
      .expect(400);
    await harness
      .patch(`/admin/redemptions/${redemptionId}/deliver`, adminSession)
      .expect(400);
  });

  it('delivers a pending redemption and rejects later terminal transitions', async () => {
    const rewardId = await createTransactionalReward();
    const response = await harness
      .post(`/rewards/${rewardId}/redeem`, participantSession)
      .expect(201);
    const redemptionId = (response.body as { id: string }).id;
    await harness
      .patch(`/admin/redemptions/${redemptionId}/deliver`, adminSession)
      .expect(200)
      .expect(({ body }: Response) =>
        expect(body).toMatchObject({ status: RedemptionStatus.DELIVERED }),
      );
    const delivered = await harness.prisma.rewardRedemption.findUniqueOrThrow({
      where: { id: redemptionId },
    });
    expect(delivered.status).toBe(RedemptionStatus.DELIVERED);
    await harness
      .patch(`/admin/redemptions/${redemptionId}/deliver`, adminSession)
      .expect(400);
    await harness
      .patch(`/admin/redemptions/${redemptionId}/cancel`, adminSession)
      .expect(400);
  });

  async function createTransactionalReward() {
    const reward = await harness.prisma.reward.create({
      data: {
        name: `Rewards transactional ${randomUUID()}`,
        costInPoints: 40,
        stock: 2,
        isActive: true,
      },
    });
    rewardIds.push(reward.id);
    return reward.id;
  }
});
