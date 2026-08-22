import { PresenceService } from '../presence.service';

describe(PresenceService.name, () => {
  const now = new Date('2026-08-21T15:00:05.000Z');
  const repository = {
    getCollectionCounts: jest.fn(),
    upsertDailySummary: jest.fn(),
    deleteSummariesBefore: jest.fn(),
  };
  const sessions = {
    expire: jest.fn(),
    deleteRetained: jest.fn(),
  };
  let service: PresenceService;

  beforeEach(() => {
    jest.clearAllMocks();
    repository.getCollectionCounts.mockResolvedValue({
      onlineParticipants: 3,
      registeredParticipants: 10,
      uniqueParticipantLogins: 4,
      newParticipantRegistrations: 2,
    });
    sessions.expire.mockResolvedValue(undefined);
    sessions.deleteRetained.mockResolvedValue(undefined);
    repository.upsertDailySummary.mockResolvedValue(undefined);
    repository.deleteSummariesBefore.mockResolvedValue(undefined);
    service = new PresenceService(repository as never, sessions as never);
  });

  it('expires sessions, captures one instant for all counts, and upserts one daily observation', async () => {
    await service.collect(now);

    expect(sessions.expire).toHaveBeenCalledWith(now);
    expect(repository.getCollectionCounts).toHaveBeenCalledWith({
      now,
      dayStart: new Date('2026-08-21T03:00:00.000Z'),
      nextDayStart: new Date('2026-08-22T03:00:00.000Z'),
    });
    expect(repository.upsertDailySummary).toHaveBeenCalledWith({
      operationalDate: new Date('2026-08-21T00:00:00.000Z'),
      observedAt: now,
      onlineParticipants: 3,
      registeredParticipants: 10,
      uniqueParticipantLogins: 4,
      newParticipantRegistrations: 2,
    });
    expect(sessions.expire.mock.invocationCallOrder[0]).toBeLessThan(
      repository.getCollectionCounts.mock.invocationCallOrder[0],
    );
    expect(
      repository.getCollectionCounts.mock.invocationCallOrder[0],
    ).toBeLessThan(repository.upsertDailySummary.mock.invocationCallOrder[0]);
  });

  it('deletes retained sessions and summaries using separate policy cutoffs', async () => {
    await service.deleteRetained(now);

    expect(sessions.deleteRetained).toHaveBeenCalledWith(now);
    expect(repository.deleteSummariesBefore).toHaveBeenCalledWith(
      new Date('2024-08-21T00:00:00.000Z'),
    );
  });

  it('builds a live overview from today and the retained aggregate totals', async () => {
    const today = {
      operationalDate: new Date('2026-08-21T00:00:00.000Z'),
      lastObservedOnlineParticipants: 4,
      registeredParticipantsAtLastObservation: 12,
      lastCollectedAt: new Date('2026-08-21T15:00:05.000Z'),
      peakOnlineParticipants: 6,
      peakAt: new Date('2026-08-21T14:00:05.000Z'),
      registeredParticipantsAtPeak: 11,
      uniqueParticipantLogins: 8,
      newParticipantRegistrations: 2,
    };
    const previous = {
      ...today,
      operationalDate: new Date('2026-08-20T00:00:00.000Z'),
      peakOnlineParticipants: 9,
      peakAt: new Date('2026-08-20T14:00:05.000Z'),
      registeredParticipantsAtPeak: 10,
    };
    repository.getOverviewData = jest.fn().mockResolvedValue({
      today,
      summaries: [previous, today],
      registeredParticipants: 12,
      uniqueParticipantsEverLogged: 9,
    });
    service = new PresenceService(repository as never, sessions as never);

    await expect(service.getOverview(now)).resolves.toEqual({
      status: 'LIVE',
      timezone: 'America/Sao_Paulo',
      heartbeatIntervalSeconds: 60,
      onlineWindowSeconds: 120,
      lastCollectedAt: '2026-08-21T12:00:05-03:00',
      onlineNow: 4,
      registeredParticipants: 12,
      uniqueParticipantsEverLogged: 9,
      monitoredDays: 2,
      today: {
        operationalDate: '2026-08-21',
        peakOnlineParticipants: 6,
        peakAt: '2026-08-21T11:00:05-03:00',
        registeredParticipantsAtPeak: 11,
        uniqueParticipantLogins: 8,
        newParticipantRegistrations: 2,
      },
      overallPeak: {
        operationalDate: '2026-08-20',
        onlineParticipants: 9,
        observedAt: '2026-08-20T11:00:05-03:00',
        registeredParticipantsAtPeak: 10,
      },
    });
  });

  it('degrades at a stale boundary and supplies an empty today summary', async () => {
    repository.getOverviewData = jest.fn().mockResolvedValue({
      today: null,
      summaries: [],
      registeredParticipants: 3,
      uniqueParticipantsEverLogged: 0,
    });
    service = new PresenceService(repository as never, sessions as never);

    await expect(service.getOverview(now)).resolves.toMatchObject({
      status: 'DEGRADED',
      lastCollectedAt: null,
      onlineNow: 0,
      registeredParticipants: 3,
      uniqueParticipantsEverLogged: 0,
      monitoredDays: 0,
      today: {
        operationalDate: '2026-08-21',
        peakOnlineParticipants: 0,
        peakAt: null,
        registeredParticipantsAtPeak: 0,
        uniqueParticipantLogins: 0,
        newParticipantRegistrations: 0,
      },
      overallPeak: {
        operationalDate: null,
        onlineParticipants: 0,
        observedAt: null,
        registeredParticipantsAtPeak: 0,
      },
    });
  });

  it.each([
    [120_000, 'LIVE'],
    [120_001, 'DEGRADED'],
  ])(
    'marks a today collection %s milliseconds old as %s',
    async (age, status) => {
      repository.getOverviewData = jest.fn().mockResolvedValue({
        today: {
          operationalDate: new Date('2026-08-21T00:00:00.000Z'),
          lastObservedOnlineParticipants: 2,
          registeredParticipantsAtLastObservation: 4,
          lastCollectedAt: new Date(now.getTime() - age),
          peakOnlineParticipants: 2,
          peakAt: new Date(now.getTime() - age),
          registeredParticipantsAtPeak: 4,
          uniqueParticipantLogins: 1,
          newParticipantRegistrations: 0,
        },
        summaries: [],
        registeredParticipants: 4,
        uniqueParticipantsEverLogged: 1,
      });
      service = new PresenceService(repository as never, sessions as never);

      await expect(service.getOverview(now)).resolves.toMatchObject({ status });
    },
  );

  it('uses the latest retained collection for the general CSV row', async () => {
    const previous = {
      operationalDate: new Date('2026-08-20T00:00:00.000Z'),
      lastObservedOnlineParticipants: 8,
      registeredParticipantsAtLastObservation: 10,
      lastCollectedAt: new Date('2026-08-20T15:00:05.000Z'),
      peakOnlineParticipants: 8,
      peakAt: new Date('2026-08-20T15:00:05.000Z'),
      registeredParticipantsAtPeak: 10,
      uniqueParticipantLogins: 3,
      newParticipantRegistrations: 1,
    };
    repository.getOverviewData = jest.fn().mockResolvedValue({
      today: null,
      summaries: [previous],
      registeredParticipants: 10,
      uniqueParticipantsEverLogged: 3,
    });
    repository.findDailySummaries = jest.fn().mockResolvedValue([]);
    service = new PresenceService(repository as never, sessions as never);

    await expect(
      service.getExportData(
        {
          from: new Date('2026-08-20T00:00:00.000Z'),
          to: new Date('2026-08-22T00:00:00.000Z'),
        },
        now,
      ),
    ).resolves.toMatchObject({
      general: {
        onlineNow: 8,
        lastCollectedAt: previous.lastCollectedAt,
      },
    });
  });

  it('returns daily history with the exact half-open period', async () => {
    const summaries = [
      {
        operationalDate: new Date('2026-08-20T00:00:00.000Z'),
        lastObservedOnlineParticipants: 3,
        registeredParticipantsAtLastObservation: 5,
        lastCollectedAt: new Date('2026-08-20T15:00:05.000Z'),
        peakOnlineParticipants: 3,
        peakAt: new Date('2026-08-20T15:00:05.000Z'),
        registeredParticipantsAtPeak: 5,
        uniqueParticipantLogins: 2,
        newParticipantRegistrations: 1,
      },
    ];
    repository.findDailySummaries = jest.fn().mockResolvedValue(summaries);
    service = new PresenceService(repository as never, sessions as never);

    await expect(
      service.getDailyHistory({
        from: new Date('2026-08-20T00:00:00.000Z'),
        to: new Date('2026-08-22T00:00:00.000Z'),
      }),
    ).resolves.toEqual({
      period: { from: '2026-08-20', to: '2026-08-22' },
      timezone: 'America/Sao_Paulo',
      items: [
        {
          operationalDate: '2026-08-20',
          onlineAtLastCollection: 3,
          lastCollectedAt: '2026-08-20T12:00:05-03:00',
          peakOnlineParticipants: 3,
          peakAt: '2026-08-20T12:00:05-03:00',
          registeredParticipantsAtPeak: 5,
          uniqueParticipantLogins: 2,
          newParticipantRegistrations: 1,
        },
      ],
    });
  });
});
