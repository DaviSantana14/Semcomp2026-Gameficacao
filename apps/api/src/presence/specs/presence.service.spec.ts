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
});
