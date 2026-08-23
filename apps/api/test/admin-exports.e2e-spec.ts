import { RedemptionStatus, UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AdminE2eHarness, AuthSession } from './support/admin-e2e-harness';

describe('Admin exports (e2e)', () => {
  let harness: AdminE2eHarness;
  let adminSession: AuthSession;
  let participantSession: AuthSession;

  beforeAll(async () => {
    harness = await AdminE2eHarness.create();
    const suffix = randomUUID();
    const [admin, participant] = await Promise.all([
      harness.prisma.user.create({
        data: {
          name: `Exports admin ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 1),
          email: `exports-admin-${suffix}@example.test`,
          role: UserRole.ADMIN,
        },
      }),
      harness.prisma.user.create({
        data: {
          name: '=Exports participant',
          cpf: harness.uniqueCpf(suffix, 2),
          email: `exports-participant-${suffix}@example.test`,
          role: UserRole.PARTICIPANT,
          points: 100,
          xp: 20,
        },
      }),
    ]);
    const reward = await harness.prisma.reward.create({
      data: {
        name: 'Exports reward',
        costInPoints: 40,
        stock: 3,
      },
    });
    await harness.prisma.rewardRedemption.create({
      data: {
        userId: participant.id,
        rewardId: reward.id,
        pointsSpent: 40,
        status: RedemptionStatus.PENDING,
        createdAt: new Date('2026-08-22T12:00:00.000Z'),
      },
    });
    adminSession = await harness.login(admin.cpf, admin.email);
    participantSession = await harness.login(
      participant.cpf,
      participant.email,
    );
  });

  afterAll(async () => {
    if (harness) await harness.close();
  });

  it('keeps participant count/list/export aligned and excludes admins', async () => {
    const query = 'Exports participant';
    const count = await harness
      .get(
        `/admin/participants/export-count?search=${encodeURIComponent(query)}&status=active`,
        adminSession,
      )
      .expect(200);
    expect(count.body).toEqual({ count: 1, maxRows: 50_000 });

    const csv = await harness
      .get(
        `/admin/participants/export.csv?search=${encodeURIComponent(query)}&status=active`,
        adminSession,
      )
      .expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.headers['content-disposition']).toBe(
      'attachment; filename="participantes.csv"',
    );
    expect(csv.text).toContain(
      'nome;email;cpf;status;pontos;xp;nivel;cadastrado_em',
    );
    expect(csv.text).toContain("'=Exports participant");
    expect(csv.text).toContain('exports-participant-');
    expect(csv.text).not.toContain('passwordHash');
    expect(csv.text).not.toContain('Exports admin');
  });

  it('exports filtered shop orders and forbids participants', async () => {
    const count = await harness
      .get(
        '/admin/redemptions/export-count?status=pending&from=2026-08-22&to=2026-08-23',
        adminSession,
      )
      .expect(200);
    expect(count.body).toEqual({ count: 1, maxRows: 50_000 });

    const csv = await harness
      .get(
        '/admin/redemptions/export.csv?status=pending&from=2026-08-22&to=2026-08-23',
        adminSession,
      )
      .expect(200);
    expect(csv.headers['content-disposition']).toBe(
      'attachment; filename="pedidos-lojinha.csv"',
    );
    expect(csv.text).toContain(
      'participante;email;recompensa;pontos_gastos;status;solicitado_em;entregue_em;cancelado_em;responsavel',
    );
    expect(csv.text).toContain('Exports reward');

    await harness
      .get('/admin/participants/export.csv', participantSession)
      .expect(403);
    await harness
      .get('/admin/redemptions/export.csv', participantSession)
      .expect(403);
  });
});
