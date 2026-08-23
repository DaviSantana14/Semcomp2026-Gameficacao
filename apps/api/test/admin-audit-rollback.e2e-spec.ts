import {
  AuditOperation,
  PointEventKind,
  PointEventSource,
  RedemptionStatus,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditRepository } from '../src/audit/audit.repository';
import {
  AuditService,
  RecordAuditEventInput,
} from '../src/audit/audit.service';
import {
  AdminReconciliationRepository,
  ReconciliationTransaction,
} from '../src/admin/admin-reconciliation.repository';
import { PrismaService } from '../src/prisma/prisma.service';
import { AdminE2eHarness, AuthSession } from './support/admin-e2e-harness';
import { hasDisposableTestDatabaseConfiguration } from './support/e2e-database-cleanup';

const describeDisposable = hasDisposableTestDatabaseConfiguration()
  ? describe
  : describe.skip;

class FailAfterAuditWriteService extends AuditService {
  constructor() {
    super({} as AuditRepository);
  }

  override async record(
    writer: Parameters<AuditService['record']>[0],
    input: RecordAuditEventInput,
  ) {
    await super.record(writer, input);
    throw new Error('Injected failure after audit write');
  }
}

class FailPointEventReconciliationRepository extends AdminReconciliationRepository {
  override withTransaction<T>(
    callback: (transaction: ReconciliationTransaction) => Promise<T>,
  ) {
    return super.withTransaction((transaction) =>
      callback({
        auditWriter: transaction.auditWriter,
        lockReconciliation: (id) => transaction.lockReconciliation(id),
        findByIdempotencyKey: (key) => transaction.findByIdempotencyKey(key),
        createPointEvent: () =>
          Promise.reject(
            new Error('Injected point-event failure after audit write'),
          ),
      }),
    );
  }
}

describeDisposable('Administrative audit transaction rollback (e2e)', () => {
  let harness: AdminE2eHarness;
  let adminSession: AuthSession;
  let participantId: string;

  beforeAll(async () => {
    harness = await AdminE2eHarness.create({
      auditService: new FailAfterAuditWriteService(),
    });
    const suffix = randomUUID();
    const [admin, participant] = await Promise.all([
      harness.prisma.user.create({
        data: {
          name: `Rollback admin ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 1),
          email: `rollback-admin-${suffix}@example.test`,
          role: UserRole.ADMIN,
        },
      }),
      harness.prisma.user.create({
        data: {
          name: `Rollback participant ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 2),
          email: `rollback-participant-${suffix}@example.test`,
          points: 100,
          xp: 20,
        },
      }),
    ]);
    participantId = participant.id;
    adminSession = await harness.loginLegacy(admin.cpf, admin.email);
  });

  afterAll(async () => {
    if (harness) await harness.close();
  });

  it('rolls back reward creation after the domain and audit writes', async () => {
    const name = `Rollback creation ${randomUUID()}`;
    await harness
      .post('/rewards', adminSession)
      .send({
        name,
        costInPoints: 20,
        stock: 2,
        isActive: true,
        reason: 'Falha injetada depois da escrita de auditoria',
      })
      .expect(500);

    await expect(
      harness.prisma.reward.count({ where: { name } }),
    ).resolves.toBe(0);
    await expect(
      harness.prisma.adminAuditEvent.count({
        where: { operation: AuditOperation.REWARD_CREATED },
      }),
    ).resolves.toBe(0);
  });

  it.each([
    ['edit', { stock: 9 }, AuditOperation.REWARD_UPDATED],
    ['status', { isActive: false }, AuditOperation.REWARD_STATUS_CHANGED],
  ] as const)(
    'rolls back reward %s after the domain and audit writes',
    async (_label, mutation, operation) => {
      const reward = await createReward();
      await harness
        .patch(`/rewards/${reward.id}`, adminSession)
        .send({
          ...mutation,
          reason: 'Falha injetada depois da escrita de auditoria',
        })
        .expect(500);

      await expect(
        harness.prisma.reward.findUniqueOrThrow({ where: { id: reward.id } }),
      ).resolves.toMatchObject(reward);
      await expect(
        harness.prisma.adminAuditEvent.count({
          where: { operation, entityId: reward.id },
        }),
      ).resolves.toBe(0);
    },
  );

  it('rolls back delivery after the transition and audit writes', async () => {
    const redemption = await createPendingRedemption();
    await harness
      .patch(`/admin/redemptions/${redemption.id}/deliver`, adminSession)
      .send({ reason: 'Falha injetada depois da escrita de auditoria' })
      .expect(500);

    await expectRedemptionUnchanged(redemption.id);
    await expect(
      harness.prisma.adminAuditEvent.count({
        where: {
          operation: AuditOperation.REWARD_REDEMPTION_DELIVERED,
          entityId: redemption.id,
        },
      }),
    ).resolves.toBe(0);
  });

  it('rolls back cancellation balances, stock, refund and audit', async () => {
    const redemption = await createPendingRedemption();
    const [userBefore, rewardBefore, pointEventsBefore] = await Promise.all([
      harness.prisma.user.findUniqueOrThrow({
        where: { id: participantId },
      }),
      harness.prisma.reward.findUniqueOrThrow({
        where: { id: redemption.rewardId },
      }),
      harness.prisma.pointEvent.count({
        where: { rewardRedemptionId: redemption.id },
      }),
    ]);
    await harness
      .patch(`/admin/redemptions/${redemption.id}/cancel`, adminSession)
      .send({ reason: 'Falha injetada depois da escrita de auditoria' })
      .expect(500);

    await expectRedemptionUnchanged(redemption.id);
    await expect(
      harness.prisma.user.findUniqueOrThrow({
        where: { id: participantId },
      }),
    ).resolves.toMatchObject({
      points: userBefore.points,
      xp: userBefore.xp,
    });
    await expect(
      harness.prisma.reward.findUniqueOrThrow({
        where: { id: redemption.rewardId },
      }),
    ).resolves.toMatchObject({ stock: rewardBefore.stock });
    await expect(
      harness.prisma.pointEvent.count({
        where: { rewardRedemptionId: redemption.id },
      }),
    ).resolves.toBe(pointEventsBefore);
    await expect(
      harness.prisma.adminAuditEvent.count({
        where: {
          operation: AuditOperation.REWARD_REDEMPTION_CANCELLED,
          entityId: redemption.id,
        },
      }),
    ).resolves.toBe(0);
  });

  async function createReward() {
    return harness.prisma.reward.create({
      data: {
        name: `Rollback reward ${randomUUID()}`,
        costInPoints: 40,
        stock: 1,
        isActive: true,
      },
    });
  }

  async function createPendingRedemption() {
    const reward = await createReward();
    return harness.prisma.rewardRedemption.create({
      data: {
        userId: participantId,
        rewardId: reward.id,
        pointsSpent: reward.costInPoints,
      },
    });
  }

  async function expectRedemptionUnchanged(id: string) {
    await expect(
      harness.prisma.rewardRedemption.findUniqueOrThrow({ where: { id } }),
    ).resolves.toMatchObject({
      status: RedemptionStatus.PENDING,
      deliveredAt: null,
      deliveredByAdminId: null,
      cancelledAt: null,
      cancelledByAdminId: null,
    });
  }
});

describeDisposable('Reconciliation audit-first rollback (e2e)', () => {
  let harness: AdminE2eHarness;
  let adminSession: AuthSession;
  let participantId: string;
  let injectedPrisma: PrismaService;

  beforeAll(async () => {
    injectedPrisma = new PrismaService();
    const auditRepository = new AuditRepository(injectedPrisma);
    const failingRepository = new FailPointEventReconciliationRepository(
      injectedPrisma,
      auditRepository,
    );
    harness = await AdminE2eHarness.create({
      reconciliationRepository: failingRepository,
    });
    const suffix = randomUUID();
    const [admin, participant] = await Promise.all([
      harness.prisma.user.create({
        data: {
          name: `Reconciliation rollback admin ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 3),
          email: `recon-rollback-admin-${suffix}@example.test`,
          role: UserRole.ADMIN,
        },
      }),
      harness.prisma.user.create({
        data: {
          name: `Reconciliation rollback participant ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 4),
          email: `reconciliation-rollback-${suffix}@example.test`,
          points: 10,
          xp: 5,
        },
      }),
    ]);
    participantId = participant.id;
    await harness.prisma.pointEvent.create({
      data: {
        userId: participant.id,
        points: 8,
        xpDelta: 5,
        kind: PointEventKind.CREDIT,
        source: PointEventSource.ADMIN_GRANT,
      },
    });
    adminSession = await harness.loginLegacy(admin.cpf, admin.email);
  });

  afterAll(async () => {
    if (harness) await harness.close();
    if (injectedPrisma) await injectedPrisma.$disconnect();
  });

  it('rolls back the provisional audit when compensation persistence fails', async () => {
    const idempotencyKey = randomUUID();
    const before = await Promise.all([
      harness.prisma.pointEvent.count({ where: { userId: participantId } }),
      harness.prisma.adminAuditEvent.count({ where: { participantId } }),
    ]);
    await harness
      .post(
        `/admin/participants/${participantId}/reconciliation/confirm`,
        adminSession,
      )
      .send({
        reason: 'Falha injetada na persistencia da compensacao',
        idempotencyKey,
      })
      .expect(500);

    await expect(
      Promise.all([
        harness.prisma.pointEvent.count({ where: { userId: participantId } }),
        harness.prisma.adminAuditEvent.count({ where: { participantId } }),
      ]),
    ).resolves.toEqual(before);
    await expect(
      harness.prisma.pointEvent.count({ where: { idempotencyKey } }),
    ).resolves.toBe(0);
  });
});
