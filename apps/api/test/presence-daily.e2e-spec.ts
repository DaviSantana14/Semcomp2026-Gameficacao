import { UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { operationalDateUtc } from '../src/common/operational-time';
import { PresenceRepository } from '../src/presence/presence.repository';
import { PresenceService } from '../src/presence/presence.service';
import { AdminE2eHarness } from './support/admin-e2e-harness';

describe('Daily presence (e2e)', () => {
  let harness: AdminE2eHarness;
  let presence: PresenceService;
  let suffix: string;

  beforeAll(async () => {
    harness = await AdminE2eHarness.create();
    presence = harness.app.get(PresenceService);
    suffix = randomUUID();
  });

  afterAll(async () => {
    if (harness) await harness.close();
  });

  it('counts distinct active participants and includes inactive registrations', async () => {
    const observedAt = new Date('2026-08-21T15:00:05.000Z');
    const createdBeforeDay = new Date('2026-08-20T15:00:05.000Z');
    const createdDuringDay = new Date('2026-08-21T10:00:05.000Z');
    const expiresAt = new Date('2026-08-21T23:00:05.000Z');
    const users = await Promise.all([
      harness.prisma.user.create({
        data: {
          name: `Presence active one ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 1),
          email: `presence-active-one-${suffix}@example.test`,
          createdAt: createdBeforeDay,
        },
      }),
      harness.prisma.user.create({
        data: {
          name: `Presence active two ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 2),
          email: `presence-active-two-${suffix}@example.test`,
          createdAt: createdBeforeDay,
        },
      }),
      harness.prisma.user.create({
        data: {
          name: `Presence inactive ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 3),
          email: `presence-inactive-${suffix}@example.test`,
          isActive: false,
          createdAt: createdDuringDay,
        },
      }),
      harness.prisma.user.create({
        data: {
          name: `Presence admin ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 4),
          email: `presence-admin-${suffix}@example.test`,
          role: UserRole.ADMIN,
          createdAt: createdBeforeDay,
        },
      }),
    ]);

    await harness.prisma.userSession.createMany({
      data: [
        sessionData(users[0].id, observedAt, expiresAt),
        sessionData(users[0].id, observedAt, expiresAt),
        sessionData(users[1].id, observedAt, expiresAt),
        sessionData(users[2].id, observedAt, expiresAt),
        sessionData(users[3].id, observedAt, expiresAt),
      ],
    });

    await presence.collect(observedAt);

    await expect(
      harness.prisma.presenceDailySummary.findUnique({
        where: { operationalDate: operationalDateUtc(observedAt) },
      }),
    ).resolves.toMatchObject({
      lastObservedOnlineParticipants: 2,
      registeredParticipantsAtLastObservation: 3,
      peakOnlineParticipants: 2,
      registeredParticipantsAtPeak: 3,
      uniqueParticipantLogins: 2,
      newParticipantRegistrations: 1,
    });
  });

  it('keeps the highest concurrent peak and the first timestamp for an equal peak', async () => {
    const repository = harness.app.get(PresenceRepository);
    const operationalDate = new Date('2026-08-22T00:00:00.000Z');
    const firstPeakAt = new Date('2026-08-22T15:00:00.000Z');
    const laterEqualPeakAt = new Date('2026-08-22T16:00:00.000Z');

    await Promise.all([
      repository.upsertDailySummary({
        operationalDate,
        observedAt: new Date('2026-08-22T14:00:00.000Z'),
        onlineParticipants: 3,
        registeredParticipants: 4,
        uniqueParticipantLogins: 3,
        newParticipantRegistrations: 1,
      }),
      repository.upsertDailySummary({
        operationalDate,
        observedAt: firstPeakAt,
        onlineParticipants: 5,
        registeredParticipants: 6,
        uniqueParticipantLogins: 4,
        newParticipantRegistrations: 2,
      }),
    ]);

    const first = await harness.prisma.presenceDailySummary.findUniqueOrThrow({
      where: { operationalDate },
    });
    expect(first.peakOnlineParticipants).toBe(5);
    expect(first.peakAt?.toISOString()).toBe(firstPeakAt.toISOString());

    await repository.upsertDailySummary({
      operationalDate,
      observedAt: laterEqualPeakAt,
      onlineParticipants: 5,
      registeredParticipants: 8,
      uniqueParticipantLogins: 5,
      newParticipantRegistrations: 3,
    });

    const later = await harness.prisma.presenceDailySummary.findUniqueOrThrow({
      where: { operationalDate },
    });
    expect(later.peakAt?.toISOString()).toBe(firstPeakAt.toISOString());
    expect(later.lastObservedOnlineParticipants).toBe(5);
    expect(later.lastCollectedAt.toISOString()).toBe(
      laterEqualPeakAt.toISOString(),
    );
  });
});

function sessionData(userId: string, startedAt: Date, expiresAt: Date) {
  return {
    id: randomUUID(),
    userId,
    startedAt,
    lastSeenAt: startedAt,
    expiresAt,
  };
}
