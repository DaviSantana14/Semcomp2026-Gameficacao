import {
  ActionRedemptionMethod,
  ActionType,
  AdminProfile,
  AuditOperation,
  PointEventKind,
  PointEventSource,
} from '@prisma/client';
import {
  activateAdminForE2e,
  AdminE2eHarness,
  AuthSession,
  createE2eAdmin,
  createE2eParticipant,
  E2E_ADMIN_PASSWORD,
  loginForE2e,
} from './support/admin-e2e-harness';
import { generateClaimCode } from '../src/common/event-code';
import { hasDisposableTestDatabaseConfiguration } from './support/e2e-database-cleanup';

jest.setTimeout(120_000);
const describeDisposable = hasDisposableTestDatabaseConfiguration()
  ? describe
  : describe.skip;

type OperatorActivationResponse = {
  operator: {
    id: string;
    adminProfile: AdminProfile;
    state: string;
  };
  activationCode: string;
  expiresAt: string;
};

type SessionWithCredentials = {
  id: string;
  cpf: string;
  email: string;
  password: string;
  adminProfile: AdminProfile;
};

type ErrorResponseBody = { code?: string };

describeDisposable('Marco 13 administrative profiles (e2e)', () => {
  let harness: AdminE2eHarness;
  let generalSession: AuthSession;
  let general: SessionWithCredentials;
  let participant: { id: string; cpf: string; email: string };
  let shop: SessionWithCredentials;
  let activities: SessionWithCredentials;
  let rewardId: string;
  let pendingOperatorSequence = 0;

  beforeAll(async () => {
    harness = await AdminE2eHarness.create();
    const suffix = `marco13-${Date.now()}`;

    const generalUser = await createE2eAdmin(harness.prisma, {
      name: 'Marco 13 general',
      cpf: harness.uniqueCpf(suffix, 1),
      email: `${suffix}-general@example.test`,
      adminProfile: AdminProfile.GENERAL,
      isActive: true,
      password: E2E_ADMIN_PASSWORD,
    });
    general = {
      id: generalUser.id,
      cpf: generalUser.cpf,
      email: generalUser.email,
      password: E2E_ADMIN_PASSWORD,
      adminProfile: AdminProfile.GENERAL,
    };
    const participantUser = await createE2eParticipant(harness.prisma, {
      name: 'Marco 13 participant',
      cpf: harness.uniqueCpf(suffix, 2),
      email: `${suffix}-participant@example.test`,
      isActive: true,
      password: 'Participant-E2e-2026!',
    });
    participant = {
      id: participantUser.id,
      cpf: participantUser.cpf,
      email: participantUser.email,
    };
    generalSession = await loginForE2e(
      harness.app,
      harness.prisma,
      general.cpf,
      general.email,
      general.password,
    );
  });

  afterAll(async () => {
    await harness?.close();
  });

  it('creates and activates profiles, enforces boundaries, and preserves audit/secret invariants', async () => {
    const suffix = `flow-${Date.now()}`;
    shop = await createAndActivateOperator(
      `Marco 13 shop ${suffix}`,
      harness.uniqueCpf(suffix, 1),
      `${suffix}-shop@example.test`,
      AdminProfile.SHOP,
    );
    activities = await createAndActivateOperator(
      `Marco 13 activities ${suffix}`,
      harness.uniqueCpf(suffix, 2),
      `${suffix}-activities@example.test`,
      AdminProfile.ACTIVITIES,
    );

    expect(shop.adminProfile).toBe(AdminProfile.SHOP);
    expect(activities.adminProfile).toBe(AdminProfile.ACTIVITIES);

    const shopAuthSession = await loginForE2e(
      harness.app,
      harness.prisma,
      shop.cpf,
      shop.email,
      shop.password,
    );
    const activitiesSession = await loginForE2e(
      harness.app,
      harness.prisma,
      activities.cpf,
      activities.email,
      activities.password,
    );
    const participantSession = await loginForE2e(
      harness.app,
      harness.prisma,
      participant.cpf,
      participant.email,
      'Participant-E2e-2026!',
    );

    const reward = await harness
      .post('/rewards', generalSession)
      .send({
        name: 'Marco 13 reward',
        costInPoints: 10,
        stock: 1,
        isActive: true,
        reason: 'Criar recompensa para o fluxo Marco 13',
      })
      .expect(201);
    rewardId = (reward.body as { id: string }).id;

    await harness
      .patch(`/rewards/${rewardId}`, shopAuthSession)
      .send({ stock: 8, reason: 'Atualizar estoque da loja Marco 13' })
      .expect(200);
    await expectForbidden(
      harness.post('/actions', shopAuthSession).send({
        name: 'Shop cannot create action',
        type: ActionType.DYNAMIC,
        points: 10,
        reason: 'Tentativa fora do perfil da loja',
      }),
    );
    await expectForbidden(harness.get('/admin/participants', shopAuthSession));

    const action = await harness
      .post('/actions', activitiesSession)
      .send({
        name: 'Marco 13 activity',
        type: ActionType.DYNAMIC,
        points: 15,
        reason: 'Criar atividade para o fluxo Marco 13',
      })
      .expect(201);
    const actionId = (action.body as { id: string }).id;
    expect(actionId).toEqual(expect.any(String));
    await expectForbidden(
      harness
        .patch(`/rewards/${rewardId}`, activitiesSession)
        .send({ stock: 99, reason: 'Tentativa fora do perfil de atividades' }),
    );
    await expectForbidden(
      harness.get('/admin/participants', activitiesSession),
    );
    await expectForbidden(
      harness.get('/admin/participants', participantSession),
    );

    const persistedReward = await harness.prisma.reward.findUniqueOrThrow({
      where: { id: rewardId },
      select: { stock: true },
    });
    expect(persistedReward.stock).toBe(8);

    const beforeDeniedMutation = await Promise.all([
      harness.prisma.action.count(),
      harness.prisma.reward.count(),
      harness.prisma.user.count(),
    ]);
    await expectForbidden(
      harness.post('/actions', shopAuthSession).send({
        name: 'Denied shop action',
        type: ActionType.DYNAMIC,
        points: 100,
        reason: 'Mutação negada para loja',
      }),
    );
    await expectForbidden(
      harness
        .patch(`/rewards/${rewardId}`, activitiesSession)
        .send({ stock: 100, reason: 'Mutação negada para atividades' }),
    );
    const afterDeniedMutation = await Promise.all([
      harness.prisma.action.count(),
      harness.prisma.reward.count(),
      harness.prisma.user.count(),
    ]);
    expect(afterDeniedMutation).toEqual(beforeDeniedMutation);

    const operationalAction = await harness.prisma.action.create({
      data: {
        name: 'Operational action',
        type: ActionType.DYNAMIC,
        code: `OP-${Date.now()}`,
        points: 10,
        isActive: true,
        isCodeActive: true,
      },
    });
    await harness.prisma.pointEvent.create({
      data: {
        userId: participant.id,
        actionId: operationalAction.id,
        points: 10,
        xpDelta: 10,
        kind: PointEventKind.CREDIT,
        source: PointEventSource.ACTION_REDEEM,
        redemptionMethod: ActionRedemptionMethod.REUSABLE_CODE,
      },
    });
    const claimAction = await harness.prisma.action.create({
      data: {
        name: 'Operational claim action',
        type: ActionType.DYNAMIC,
        points: 20,
        isActive: true,
      },
    });
    const claimCodeValue = generateClaimCode();
    await harness.prisma.claimCode.create({
      data: {
        code: claimCodeValue,
        actionId: claimAction.id,
        isUsed: true,
        isActive: false,
        usedById: participant.id,
        usedAt: new Date(),
      },
    });
    const operationalReward = await harness.prisma.reward.create({
      data: {
        name: 'Operational reward',
        costInPoints: 10,
        stock: 2,
        isActive: true,
      },
    });
    await harness.prisma.rewardRedemption.create({
      data: {
        userId: participant.id,
        rewardId: operationalReward.id,
        pointsSpent: 10,
      },
    });

    const codeRedemptions = await harness
      .get('/admin/code-redemptions?method=reusable_code', generalSession)
      .expect(200);
    const codeParticipant = (
      codeRedemptions.body as {
        items: Array<{ participant: Record<string, unknown> }>;
      }
    ).items.find((item) => item.participant.id === participant.id);
    expect(codeParticipant?.participant).toEqual({
      id: participant.id,
      name: 'Marco 13 participant',
    });
    expect(codeParticipant?.participant).not.toHaveProperty('cpf');
    expect(codeParticipant?.participant).not.toHaveProperty('email');

    const claimCodes = await harness
      .get(`/admin/claim-codes?search=${claimCodeValue}`, generalSession)
      .expect(200);
    const usedBy = (
      claimCodes.body as {
        items: Array<{ usedBy: Record<string, unknown> | null }>;
      }
    ).items[0]?.usedBy;
    expect(usedBy).toEqual({
      id: participant.id,
      name: 'Marco 13 participant',
    });
    expect(usedBy).not.toHaveProperty('cpf');
    expect(usedBy).not.toHaveProperty('email');

    const redemptions = await harness
      .get(
        `/admin/redemptions?rewardId=${operationalReward.id}`,
        generalSession,
      )
      .expect(200);
    const redemptionUser = (
      redemptions.body as {
        items: Array<{ user: Record<string, unknown> }>;
      }
    ).items[0]?.user;
    expect(redemptionUser).toEqual({
      id: participant.id,
      name: 'Marco 13 participant',
    });
    expect(redemptionUser).not.toHaveProperty('cpf');
    expect(redemptionUser).not.toHaveProperty('email');

    const expired = await createPendingOperator('expired');
    await harness.prisma.adminActivation.updateMany({
      where: { adminUserId: expired.operator.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    const expiredResponse = await activateAdminForE2e(harness.app, {
      code: expired.activationCode,
      cpf: expired.cpf,
      email: expired.email,
      password: E2E_ADMIN_PASSWORD,
    });
    expect(expiredResponse.status).toBe(401);
    expect((expiredResponse.body as ErrorResponseBody).code).toBe(
      'ADMIN_ACTIVATION_INVALID',
    );

    const reused = await createPendingOperator('reused');
    const firstUse = await activateAdminForE2e(harness.app, {
      code: reused.activationCode,
      cpf: reused.cpf,
      email: reused.email,
      password: E2E_ADMIN_PASSWORD,
    });
    expect(firstUse.status).toBe(204);
    const secondUse = await activateAdminForE2e(harness.app, {
      code: reused.activationCode,
      cpf: reused.cpf,
      email: reused.email,
      password: E2E_ADMIN_PASSWORD,
    });
    expect(secondUse.status).toBe(401);
    expect((secondUse.body as ErrorResponseBody).code).toBe(
      'ADMIN_ACTIVATION_INVALID',
    );

    const concurrent = await createPendingOperator('concurrent');
    const concurrentResponses = await Promise.all(
      [0, 1].map(() =>
        activateAdminForE2e(harness.app, {
          code: concurrent.activationCode,
          cpf: concurrent.cpf,
          email: concurrent.email,
          password: E2E_ADMIN_PASSWORD,
        }),
      ),
    );
    expect(
      concurrentResponses.map((response) => response.status).sort(),
    ).toEqual([204, 401]);

    const shopSessionBeforeInactivation = shopAuthSession;
    await harness
      .patch(`/admin/operators/${shop.id}/status`, generalSession)
      .send({ isActive: false, reason: 'Inativar operador da loja' })
      .expect(200);
    await harness.get('/users/me', shopSessionBeforeInactivation).expect(401);
    await harness
      .patch(`/admin/operators/${shop.id}/status`, generalSession)
      .send({ isActive: true, reason: 'Reativar operador da loja' })
      .expect(200);
    const shopSessionBeforeReset = await loginForE2e(
      harness.app,
      harness.prisma,
      shop.cpf,
      shop.email,
      shop.password,
    );
    const reset = await harness
      .post(`/admin/operators/${shop.id}/activation-reset`, generalSession)
      .send({ reason: 'Resetar ativacao do operador da loja' })
      .expect(201);
    expect((reset.body as { activationCode?: unknown }).activationCode).toEqual(
      expect.any(String),
    );
    await harness.get('/users/me', shopSessionBeforeReset).expect(401);

    const secondGeneral = await createAndActivateOperator(
      'Marco 13 second general',
      harness.uniqueCpf(`second-${Date.now()}`, 1),
      `second-general-${Date.now()}@example.test`,
      AdminProfile.GENERAL,
    );
    const secondGeneralSession = await loginForE2e(
      harness.app,
      harness.prisma,
      secondGeneral.cpf,
      secondGeneral.email,
      secondGeneral.password,
    );
    const removalResponses = await Promise.all([
      harness
        .patch(`/admin/operators/${general.id}/status`, generalSession)
        .send({ isActive: false, reason: 'Remover primeiro geral em corrida' }),
      harness
        .patch(
          `/admin/operators/${secondGeneral.id}/status`,
          secondGeneralSession,
        )
        .send({ isActive: false, reason: 'Remover segundo geral em corrida' }),
    ]);
    expect(removalResponses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const lastGeneralFailure = removalResponses.find(
      (response) => response.status === 409,
    );
    expect(
      (lastGeneralFailure?.body as ErrorResponseBody | undefined)?.code,
    ).toBe('LAST_ACTIVE_GENERAL_ADMIN');
    expect(
      await harness.prisma.user.count({
        where: {
          role: 'ADMIN',
          adminProfile: AdminProfile.GENERAL,
          isActive: true,
          passwordHash: { not: null },
        },
      }),
    ).toBe(1);

    const auditEvents = await harness.prisma.adminAuditEvent.findMany({
      where: {
        operation: {
          in: [
            AuditOperation.ADMIN_OPERATOR_CREATED,
            AuditOperation.ADMIN_OPERATOR_UPDATED,
            AuditOperation.ADMIN_OPERATOR_STATUS_CHANGED,
            AuditOperation.ADMIN_OPERATOR_ACTIVATION_RESET,
            AuditOperation.ADMIN_OPERATOR_ACTIVATED,
          ],
        },
      },
      select: { before: true, after: true, metadata: true },
    });
    const serializedAudit = JSON.stringify(auditEvents);
    expect(serializedAudit).not.toMatch(
      /"(?:activationCode|passwordHash|codeHash)"/,
    );
    expect(serializedAudit).not.toContain(E2E_ADMIN_PASSWORD);
    expect(serializedAudit).not.toContain(expired.activationCode);
    expect(serializedAudit).not.toContain(reused.activationCode);
    expect(serializedAudit).not.toContain(concurrent.activationCode);
  });

  async function createAndActivateOperator(
    name: string,
    cpf: string,
    email: string,
    adminProfile: AdminProfile,
  ): Promise<SessionWithCredentials> {
    const createResponse = await harness
      .post('/admin/operators', generalSession)
      .send({
        name,
        cpf,
        email,
        adminProfile,
        reason: `Criar operador ${adminProfile.toLowerCase()} Marco 13`,
      })
      .expect(201);
    const body = createResponse.body as OperatorActivationResponse;
    expect(body.operator.adminProfile).toBe(adminProfile);
    expect(body.operator.state).toBe('PENDING_ACTIVATION');
    const activationResponse = await activateAdminForE2e(harness.app, {
      code: body.activationCode,
      cpf,
      email,
      password: E2E_ADMIN_PASSWORD,
    });
    expect(activationResponse.status).toBe(204);
    const activated = await harness.prisma.user.findUniqueOrThrow({
      where: { id: body.operator.id },
      select: { id: true, cpf: true, email: true, adminProfile: true },
    });
    return {
      ...activated,
      password: E2E_ADMIN_PASSWORD,
      adminProfile: activated.adminProfile!,
    };
  }

  async function createPendingOperator(label: string) {
    const sequence = ++pendingOperatorSequence;
    const cpf = harness.uniqueCpf(`pending-${sequence}`, 7);
    const email = `marco13-${label}-${sequence}@example.test`;
    const createResponse = await harness
      .post('/admin/operators', generalSession)
      .send({
        name: `Marco 13 ${label}`,
        cpf,
        email,
        adminProfile: AdminProfile.SHOP,
        reason: `Criar operador pendente ${label}`,
      })
      .expect(201);
    const body = createResponse.body as OperatorActivationResponse;
    return {
      operator: body.operator,
      activationCode: body.activationCode,
      cpf,
      email,
    };
  }
});

async function expectForbidden(
  response: Promise<{ status: number; body: unknown }>,
) {
  const result = await response;
  expect(result.status).toBe(403);
  return result;
}
