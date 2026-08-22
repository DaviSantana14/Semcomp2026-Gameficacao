import { PresenceRepository } from '../presence.repository';

describe(PresenceRepository.name, () => {
  it('counts distinct active participant users inside the online window', async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      {
        onlineParticipants: 2n,
        registeredParticipants: 5n,
        uniqueParticipantLogins: 3n,
        newParticipantRegistrations: 1n,
      },
    ]);
    const repository = new PresenceRepository({ $queryRaw: queryRaw } as never);
    const now = new Date('2026-08-21T15:00:05.000Z');
    const dayStart = new Date('2026-08-21T03:00:00.000Z');
    const nextDayStart = new Date('2026-08-22T03:00:00.000Z');

    await expect(
      repository.getCollectionCounts({ now, dayStart, nextDayStart }),
    ).resolves.toEqual({
      onlineParticipants: 2,
      registeredParticipants: 5,
      uniqueParticipantLogins: 3,
      newParticipantRegistrations: 1,
    });

    const calls = queryRaw.mock.calls as unknown as Array<
      [{ strings: readonly string[] }]
    >;
    const query = calls[0][0];
    const sql = query.strings.join('?');
    expect(sql).toMatch(/COUNT\(DISTINCT\s+s\."userId"\)/i);
    expect(sql).toMatch(/u\."role"\s*=\s*'PARTICIPANT'/i);
    expect(sql).toMatch(/u\."isActive"\s+IS\s+TRUE/i);
    expect(sql).toMatch(/s\."endedAt"\s+IS\s+NULL/i);
    expect(sql).toMatch(/s\."expiresAt"\s*>/i);
    expect(sql).toMatch(/s\."lastSeenAt"\s*>=/i);
    expect(sql).toMatch(/s\."startedAt"\s*>=/i);
    expect(sql).toMatch(/s\."startedAt"\s*</i);
    expect(sql).toMatch(/u\."createdAt"\s*>=/i);
    expect(sql).toMatch(/u\."createdAt"\s*</i);
  });

  it('upserts a daily observation while preserving a strictly greater peak', async () => {
    const executeRaw = jest.fn().mockResolvedValue(1);
    const repository = new PresenceRepository({
      $executeRaw: executeRaw,
    } as never);

    await repository.upsertDailySummary({
      operationalDate: new Date('2026-08-21T00:00:00.000Z'),
      observedAt: new Date('2026-08-21T15:00:05.000Z'),
      onlineParticipants: 5,
      registeredParticipants: 10,
      uniqueParticipantLogins: 4,
      newParticipantRegistrations: 2,
    });

    const calls = executeRaw.mock.calls as unknown as Array<
      [{ strings: readonly string[] }]
    >;
    const query = calls[0][0];
    const sql = query.strings.join('?');
    expect(sql).toContain('ON CONFLICT ("operationalDate") DO UPDATE SET');
    expect(sql).toContain('"updatedAt"');
    expect(sql).toContain('CURRENT_TIMESTAMP');
    expect(sql).toContain('"lastObservedOnlineParticipants" = EXCLUDED');
    expect(sql).toMatch(
      /GREATEST\(\s*"PresenceDailySummary"\."lastCollectedAt"/,
    );
    expect(sql).toContain(
      'EXCLUDED."peakOnlineParticipants" > "PresenceDailySummary"."peakOnlineParticipants"',
    );
    expect(sql).toMatch(
      /GREATEST\(\s*"PresenceDailySummary"\."uniqueParticipantLogins",\s*EXCLUDED\."uniqueParticipantLogins"/,
    );
  });
});
