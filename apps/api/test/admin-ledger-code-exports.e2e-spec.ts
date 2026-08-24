import {
  ActionRedemptionMethod,
  ActionType,
  PointEventKind,
  PointEventSource,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AdminE2eHarness, AuthSession } from './support/admin-e2e-harness';

describe('Admin global ledgers and exports (e2e)', () => {
  let harness: AdminE2eHarness;
  let adminSession: AuthSession;
  let participantSession: AuthSession;
  let participantId: string;

  beforeAll(async () => {
    harness = await AdminE2eHarness.create();
    const suffix = randomUUID();
    const [admin, participant] = await Promise.all([
      harness.prisma.user.create({
        data: {
          name: `Ledger admin ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 1),
          email: `ledger-admin-${suffix}@example.test`,
          role: UserRole.ADMIN,
          adminProfile: 'GENERAL',
        },
      }),
      harness.prisma.user.create({
        data: {
          name: `Ledger Ada ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 2),
          email: `ledger-ada-${suffix}@example.test`,
          role: UserRole.PARTICIPANT,
        },
      }),
    ]);
    participantId = participant.id;

    const [claimAction, reusableAction, directAction] = await Promise.all([
      harness.prisma.action.create({
        data: {
          name: `Ledger claim ${suffix}`,
          type: ActionType.CHECKIN,
          points: 25,
        },
      }),
      harness.prisma.action.create({
        data: {
          name: `Ledger reusable ${suffix}`,
          type: ActionType.BONUS,
          code: `REUSABLE-${suffix}`.toUpperCase(),
          points: 30,
          isCodeActive: true,
        },
      }),
      harness.prisma.action.create({
        data: {
          name: `Ledger direct ${suffix}`,
          type: ActionType.DYNAMIC,
          points: 10,
        },
      }),
    ]);
    const claimCode = await harness.prisma.claimCode.create({
      data: {
        code: 'ABCD-EFGH',
        actionId: claimAction.id,
      },
    });
    await harness.prisma.pointEvent.createMany({
      data: [
        {
          userId: participant.id,
          actionId: claimAction.id,
          claimCodeId: claimCode.id,
          points: 25,
          xpDelta: 25,
          kind: PointEventKind.CREDIT,
          source: PointEventSource.ACTION_REDEEM,
          redemptionMethod: ActionRedemptionMethod.CLAIM_CODE,
          createdAt: new Date('2026-08-02T02:59:00.000Z'),
        },
        {
          userId: participant.id,
          actionId: reusableAction.id,
          points: 30,
          xpDelta: 30,
          kind: PointEventKind.CREDIT,
          source: PointEventSource.ACTION_REDEEM,
          redemptionMethod: ActionRedemptionMethod.REUSABLE_CODE,
          createdAt: new Date('2026-08-02T03:00:00.000Z'),
        },
        {
          userId: participant.id,
          actionId: directAction.id,
          points: 10,
          xpDelta: 10,
          kind: PointEventKind.CREDIT,
          source: PointEventSource.ACTION_REDEEM,
          redemptionMethod: ActionRedemptionMethod.DIRECT,
          createdAt: new Date('2026-08-04T12:00:00.000Z'),
        },
      ],
    });

    adminSession = await harness.loginLegacy(admin.cpf, admin.email);
    participantSession = await harness.loginLegacy(
      participant.cpf,
      participant.email,
    );
  });

  afterAll(async () => {
    if (harness) await harness.close();
  });

  it('keeps point-event list, count and CSV on the same São Paulo half-open range', async () => {
    const query = `search=${encodeURIComponent('Ledger Ada')}&source=action_redeem&method=claim_code&from=2026-08-01&to=2026-08-02`;
    const page = await harness
      .get(`/admin/point-events?${query}`, adminSession)
      .expect(200);
    const pointPageBody = page.body as {
      meta: { total: number };
      items: Array<{
        participant: { id: string };
        claimCode: { code: string } | null;
      }>;
    };
    expect(pointPageBody.meta.total).toBe(1);
    expect(pointPageBody.items[0]?.participant.id).toBe(participantId);
    expect(pointPageBody.items[0]?.claimCode?.code).toMatch(/^AB\*+..$/);
    expect(JSON.stringify(page.body)).not.toContain('ABCD-');

    await harness
      .get(`/admin/point-events/export-count?${query}`, adminSession)
      .expect(200)
      .expect(({ body }: { body: unknown }) =>
        expect(body).toEqual({ count: 1, maxRows: 50_000 }),
      );
    const csv = await harness
      .get(`/admin/point-events/export.csv?${query}`, adminSession)
      .expect(200);
    expect(csv.headers['content-disposition']).toBe(
      'attachment; filename="movimentacoes.csv"',
    );
    expect(csv.text).toContain(
      'participante;email;tipo;origem;pontos_delta;xp_delta;referencia;descricao;ator;criado_em',
    );
    expect(csv.text).not.toContain('ABCD-');
  });

  it('keeps code-redemption list/count/CSV filtered and forbids participants', async () => {
    const query = `search=${encodeURIComponent('Ledger Ada')}&method=claim_code&from=2026-08-01&to=2026-08-03`;
    const page = await harness
      .get(`/admin/code-redemptions?${query}`, adminSession)
      .expect(200);
    const codePageBody = page.body as {
      meta: { total: number };
      items: Array<{ code: string | null }>;
    };
    expect(codePageBody.meta.total).toBe(1);
    expect(codePageBody.items[0]?.code).toEqual(expect.stringContaining('*'));
    await harness
      .get(`/admin/code-redemptions/export-count?${query}`, adminSession)
      .expect(200)
      .expect(({ body }: { body: unknown }) =>
        expect(body).toEqual({ count: 1, maxRows: 50_000 }),
      );
    const csv = await harness
      .get(`/admin/code-redemptions/export.csv?${query}`, adminSession)
      .expect(200);
    expect(csv.headers['content-disposition']).toBe(
      'attachment; filename="resgates-codigos.csv"',
    );
    expect(csv.text).toContain(
      'participante;email;atividade;metodo;codigo_mascarado;pontos;xp;resgatado_em',
    );
    expect(csv.text).not.toContain('ABCD-');

    await harness.get('/admin/point-events', participantSession).expect(403);
    await harness
      .get('/admin/code-redemptions', participantSession)
      .expect(403);
  });
});
