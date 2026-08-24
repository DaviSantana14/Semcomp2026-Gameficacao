import { AuditOperation, RedemptionStatus, UserRole } from '@prisma/client';
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
  let adminId: string;
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
          adminProfile: 'GENERAL',
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
    adminId = admin.id;
    participantId = participant.id;
    adminSession = await harness.loginLegacy(admin.cpf, admin.email);
    participantSession = await harness.loginLegacy(
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
        reason: 'Criacao aprovada para o catalogo administrativo',
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
      .send({
        reason: 'Atualizacao aprovada para o catalogo administrativo',
        costInPoints: 45,
        stock: 4,
        isActive: false,
      })
      .expect(200)
      .expect(({ body }: Response) =>
        expect(body).toMatchObject({
          id: rewardId,
          costInPoints: 45,
          stock: 4,
          isActive: false,
        }),
      );

    await harness
      .patch(`/rewards/${rewardId}`, adminSession)
      .send({
        reason: 'Reativacao aprovada para validar auditoria de status',
        isActive: true,
      })
      .expect(200);
    await harness
      .patch(`/rewards/${rewardId}`, adminSession)
      .send({
        reason: 'Desativacao aprovada para validar auditoria de status',
        isActive: false,
      })
      .expect(200);

    const [updateAudit, statusAudits] = await Promise.all([
      harness.prisma.adminAuditEvent.findFirstOrThrow({
        where: { entityId: rewardId, operation: AuditOperation.REWARD_UPDATED },
        orderBy: { createdAt: 'desc' },
      }),
      harness.prisma.adminAuditEvent.findMany({
        where: {
          entityId: rewardId,
          operation: AuditOperation.REWARD_STATUS_CHANGED,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    expect(updateAudit).toMatchObject({
      actorAdminId: adminId,
      reason: 'Atualizacao aprovada para o catalogo administrativo',
    });
    expect(updateAudit.before).toMatchObject({ stock: 3, isActive: true });
    expect(updateAudit.after).toMatchObject({ stock: 4, isActive: false });
    expect(statusAudits).toHaveLength(2);
    expect(
      statusAudits.map(({ before, after }) => ({ before, after })),
    ).toEqual([
      { before: { isActive: false }, after: { isActive: true } },
      { before: { isActive: true }, after: { isActive: false } },
    ]);

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

  it('serializes equivalent concurrent reward deactivations', async () => {
    const rewardId = await createTransactionalReward();
    const reason = 'Desativacao concorrente equivalente para auditoria unica';

    const responses = await Promise.all([
      harness
        .patch(`/rewards/${rewardId}`, adminSession)
        .send({ reason, isActive: false }),
      harness
        .patch(`/rewards/${rewardId}`, adminSession)
        .send({ reason, isActive: false }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    expect(
      responses.map(({ body }) => body as { id: string; isActive: boolean }),
    ).toEqual([
      expect.objectContaining({ id: rewardId, isActive: false }),
      expect.objectContaining({ id: rewardId, isActive: false }),
    ]);
    const audits = await harness.prisma.adminAuditEvent.findMany({
      where: {
        entityId: rewardId,
        operation: AuditOperation.REWARD_STATUS_CHANGED,
      },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      before: { isActive: true },
      after: { isActive: false },
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
    const debit = await harness.prisma.pointEvent.findFirstOrThrow({
      where: { rewardRedemptionId: redemptionId, points: -40 },
    });
    expect(debit.source).toBe('REWARD_REDEMPTION');

    const [firstCancel, secondCancel] = await Promise.all([
      harness
        .patch(`/admin/redemptions/${redemptionId}/cancel`, adminSession)
        .send({
          reason: 'Cancelamento aprovado por indisponibilidade operacional',
        }),
      harness
        .patch(`/admin/redemptions/${redemptionId}/cancel`, adminSession)
        .send({
          reason: 'Cancelamento aprovado por indisponibilidade operacional',
        }),
    ]);
    const cancellationStatuses = [firstCancel.status, secondCancel.status];
    expect(
      cancellationStatuses.filter((status) => status === 200),
    ).toHaveLength(1);
    expect(
      cancellationStatuses.some((status) => status === 400 || status === 409),
    ).toBe(true);
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
    expect(cancelled.cancelledAt).toBeInstanceOf(Date);
    expect(cancelled.cancelledByAdminId).toBe(adminId);
    const refunds = await harness.prisma.pointEvent.findMany({
      where: { rewardRedemptionId: redemptionId, points: 40 },
    });
    expect(refunds).toHaveLength(1);
    const cancelAudit = await harness.prisma.adminAuditEvent.findFirstOrThrow({
      where: {
        entityId: redemptionId,
        operation: AuditOperation.REWARD_REDEMPTION_CANCELLED,
      },
    });
    expect(cancelAudit.before).toMatchObject({
      id: redemptionId,
      status: RedemptionStatus.PENDING,
      stock: 1,
      points: before.points - 40,
    });
    expect(cancelAudit.after).toMatchObject({
      id: redemptionId,
      status: RedemptionStatus.CANCELLED,
      stock: 2,
      points: before.points,
      pointEventId: refunds[0].id,
    });
    expect(cancelAudit.metadata).toMatchObject({
      rewardRedemptionId: redemptionId,
      pointEventId: refunds[0].id,
    });
    await harness
      .patch(`/admin/redemptions/${redemptionId}/cancel`, adminSession)
      .send({ reason: 'Cancelamento repetido para validar conflito terminal' })
      .expect(400);
    await harness
      .patch(`/admin/redemptions/${redemptionId}/deliver`, adminSession)
      .send({ reason: 'Entrega invalida depois do cancelamento confirmado' })
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
      .send({ reason: 'Entrega confirmada presencialmente pela coordenação' })
      .expect(200)
      .expect(({ body }: Response) =>
        expect(body).toMatchObject({ status: RedemptionStatus.DELIVERED }),
      );
    const delivered = await harness.prisma.rewardRedemption.findUniqueOrThrow({
      where: { id: redemptionId },
    });
    expect(delivered.status).toBe(RedemptionStatus.DELIVERED);
    expect(delivered.deliveredAt).toBeInstanceOf(Date);
    expect(delivered.deliveredByAdminId).toBe(adminId);
    const deliveryAudit = await harness.prisma.adminAuditEvent.findFirstOrThrow(
      {
        where: {
          entityId: redemptionId,
          operation: AuditOperation.REWARD_REDEMPTION_DELIVERED,
        },
      },
    );
    expect(deliveryAudit.before).toMatchObject({
      id: redemptionId,
      status: RedemptionStatus.PENDING,
      deliveredAt: null,
      deliveredByAdminId: null,
    });
    expect(deliveryAudit.after).toMatchObject({
      id: redemptionId,
      status: RedemptionStatus.DELIVERED,
      deliveredByAdminId: adminId,
    });
    await expect(
      harness.prisma.pointEvent.count({
        where: { rewardRedemptionId: redemptionId, points: { gt: 0 } },
      }),
    ).resolves.toBe(0);
    await harness
      .patch(`/admin/redemptions/${redemptionId}/deliver`, adminSession)
      .send({ reason: 'Entrega repetida para validar conflito terminal' })
      .expect(400);
    await harness
      .patch(`/admin/redemptions/${redemptionId}/cancel`, adminSession)
      .send({ reason: 'Cancelamento invalido depois da entrega confirmada' })
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
