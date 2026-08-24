import { UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { SecurityHttpMetricsService } from '../src/security/security-http-metrics.service';
import { AdminE2eHarness, AuthSession } from './support/admin-e2e-harness';

type SecurityOverviewBody = {
  periods: {
    fiveMinutes: {
      unauthorized: number;
      forbidden: number;
      rateLimited: number;
    };
  };
  thresholds: {
    unauthorized: number;
    forbidden: number;
    rateLimited: number;
    windowMinutes: number;
  };
};

describe('Admin security metrics (e2e)', () => {
  let harness: AdminE2eHarness;
  let adminSession: AuthSession;
  let participantSession: AuthSession;

  beforeAll(async () => {
    harness = await AdminE2eHarness.create();
    const suffix = randomUUID();
    const [admin, participant] = await Promise.all([
      harness.prisma.user.create({
        data: {
          name: `Security metrics admin ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 1),
          email: `security-metrics-admin-${suffix}@example.test`,
          role: UserRole.ADMIN,
          adminProfile: 'GENERAL',
        },
      }),
      harness.prisma.user.create({
        data: {
          name: `Security metrics participant ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 2),
          email: `security-participant-${suffix}@example.test`,
          role: UserRole.PARTICIPANT,
        },
      }),
    ]);

    adminSession = await harness.loginLegacy(admin.cpf, admin.email);
    participantSession = await harness.loginLegacy(
      participant.cpf,
      participant.email,
    );
  });

  afterAll(async () => {
    if (harness) {
      await harness.close();
    }
  });

  it('aggregates only final 401, 403 and named-policy 429 responses', async () => {
    await request(harness.app.getHttpServer())
      .get('/admin/security-metrics/overview')
      .expect(401);
    await harness
      .get('/admin/security-metrics/overview', participantSession)
      .expect(403);

    const exportStatuses: number[] = [];
    let rateLimitedHeaders: Record<string, string | string[] | undefined> = {};
    for (let index = 0; index < 6; index += 1) {
      const response = await harness.get(
        '/admin/participants/export.csv',
        adminSession,
      );
      exportStatuses.push(response.status);
      if (response.status === 429) {
        rateLimitedHeaders = response.headers;
      }
    }
    expect(exportStatuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(exportStatuses[5]).toBe(429);
    expect(rateLimitedHeaders['retry-after']).toBeDefined();

    const metrics = harness.app.get(SecurityHttpMetricsService);
    await metrics.flush(new Date());

    const overview = await harness
      .get('/admin/security-metrics/overview', adminSession)
      .expect(200);
    const body = overview.body as unknown as SecurityOverviewBody;

    expect(typeof body.periods.fiveMinutes.unauthorized).toBe('number');
    expect(typeof body.periods.fiveMinutes.forbidden).toBe('number');
    expect(typeof body.periods.fiveMinutes.rateLimited).toBe('number');
    expect(body.periods.fiveMinutes.unauthorized).toBeGreaterThanOrEqual(1);
    expect(body.periods.fiveMinutes.forbidden).toBeGreaterThanOrEqual(1);
    expect(body.periods.fiveMinutes.rateLimited).toBeGreaterThanOrEqual(1);
    expect(body.thresholds).toEqual({
      unauthorized: 20,
      forbidden: 10,
      rateLimited: 5,
      windowMinutes: 5,
    });
    expect(JSON.stringify(body)).not.toMatch(
      /cpf|email|cookie|jwt|token|password|requestId/i,
    );
  });

  it('keeps the overview admin-only', async () => {
    await harness
      .get('/admin/security-metrics/overview', participantSession)
      .expect(403);
  });
});
