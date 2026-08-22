import { UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PresenceService } from '../src/presence/presence.service';
import { operationalDateUtc, addUtcDays } from '../src/common/operational-time';
import { AdminE2eHarness, AuthSession } from './support/admin-e2e-harness';

describe('Admin presence API (e2e)', () => {
  let harness: AdminE2eHarness;
  let adminSession: AuthSession;
  let participantSession: AuthSession;
  let day: Date;

  beforeAll(async () => {
    harness = await AdminE2eHarness.create();
    const suffix = randomUUID();
    const [admin, participant] = await Promise.all([
      harness.prisma.user.create({
        data: {
          name: `Presence API admin ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 1),
          email: `presence-api-admin-${suffix}@example.test`,
          role: UserRole.ADMIN,
        },
      }),
      harness.prisma.user.create({
        data: {
          name: `Presence API participant ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 2),
          email: `presence-api-participant-${suffix}@example.test`,
        },
      }),
    ]);

    adminSession = await harness.login(admin.cpf, admin.email);
    participantSession = await harness.login(
      participant.cpf,
      participant.email,
    );

    const observedAt = new Date();
    day = operationalDateUtc(observedAt);
    await harness.app.get(PresenceService).collect(observedAt);
  });

  afterAll(async () => {
    if (harness) await harness.close();
  });

  it('returns overview, daily history and the aggregate CSV to administrators', async () => {
    const from = dateOnly(day);
    const to = dateOnly(addUtcDays(day, 1));

    const overview = await harness
      .get('/admin/presence/overview', adminSession)
      .expect(200);
    expect(overview.body).toMatchObject({
      status: 'LIVE',
      timezone: 'America/Sao_Paulo',
      onlineWindowSeconds: 120,
      registeredParticipants: 1,
      monitoredDays: 1,
      today: { operationalDate: from },
    });

    const history = await harness
      .get(`/admin/presence/history?from=${from}&to=${to}`, adminSession)
      .expect(200);
    expect(history.body).toMatchObject({
      period: { from, to },
      timezone: 'America/Sao_Paulo',
      items: [expect.objectContaining({ operationalDate: from })],
    });

    const csv = await harness
      .get(`/admin/presence/export.csv?from=${from}&to=${to}`, adminSession)
      .expect(200);
    expect(csv.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
    expect(csv.headers['content-disposition']).toBe(
      `attachment; filename="presenca-${from}-a-${to}.csv"`,
    );
    expect(csv.text).toContain('GERAL;');
    expect(csv.text).toContain(`DIARIO;${from};`);
  });

  it('forbids participants and rejects invalid ranges', async () => {
    const from = dateOnly(day);
    const to = dateOnly(addUtcDays(day, 1));

    await harness
      .get('/admin/presence/overview', participantSession)
      .expect(403);
    await harness
      .get(`/admin/presence/history?from=${to}&to=${from}`, adminSession)
      .expect(400);
  });
});

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
