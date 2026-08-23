import { Test } from '@nestjs/testing';
import {
  createSessionDraft,
  SessionsService,
  SessionStartRejectedError,
} from '../sessions.service';
import { SessionsRepository } from '../sessions.repository';

const now = new Date('2026-08-21T12:00:00.000Z');

const draft = {
  id: '11111111-1111-4111-8111-111111111111',
  startedAt: now,
  lastSeenAt: now,
  expiresAt: new Date(now.getTime() + 8 * 60 * 60 * 1000),
};

const userSummary = {
  id: 'user-1',
  name: 'Ada Lovelace',
  cpf: '52998224725',
  email: 'ada@example.com',
  role: 'PARTICIPANT' as const,
  points: 0,
  xp: 0,
  level: 1,
  isActive: true,
  lastLoginAt: now,
  adminProfile: null,
  passwordResetRequired: false,
  passwordResetExpiresAt: null,
  createdAt: now,
};

describe(createSessionDraft.name, () => {
  it('creates an application-generated session draft with an eight-hour expiry', () => {
    const draft = createSessionDraft(now);

    expect(typeof draft.id).toBe('string');
    expect(draft.startedAt).toBe(now);
    expect(draft.lastSeenAt).toBe(now);
    expect(draft.expiresAt.getTime()).toBe(now.getTime() + 8 * 60 * 60 * 1000);
  });

  it('generates a distinct UUID for every draft so the jti never repeats', () => {
    const first = createSessionDraft(now);
    const second = createSessionDraft(now);

    expect(first.id).not.toBe(second.id);
    expect(first.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe(SessionsService.name, () => {
  let service: SessionsService;
  const repository = {
    registerParticipant: jest.fn(),
    startSession: jest.fn(),
    findValidSessionWithUser: jest.fn(),
    heartbeatSession: jest.fn(),
    endSession: jest.fn(),
    expireSessions: jest.fn(),
    deleteSessionsEndedBefore: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: SessionsRepository, useValue: repository },
      ],
    }).compile();
    service = module.get(SessionsService);
  });

  it('registers participant, session and lastLoginAt atomically through one call', async () => {
    repository.registerParticipant.mockResolvedValue(userSummary);

    await expect(
      service.registerParticipant(draft, {
        name: userSummary.name,
        cpf: userSummary.cpf,
        email: userSummary.email,
        passwordHash: '$2b$12$hash',
      }),
    ).resolves.toBe(userSummary);
    expect(repository.registerParticipant).toHaveBeenCalledWith(draft, {
      name: userSummary.name,
      cpf: userSummary.cpf,
      email: userSummary.email,
      passwordHash: '$2b$12$hash',
    });
  });

  it('starts a persisted session only when the role and active state still hold', async () => {
    repository.startSession.mockResolvedValue(userSummary);

    await expect(
      service.start(userSummary.id, 'PARTICIPANT', draft),
    ).resolves.toBe(userSummary);
    expect(repository.startSession).toHaveBeenCalledWith(
      userSummary.id,
      'PARTICIPANT',
      draft,
    );
  });

  it.each([
    ['missing identity', null],
    ['inactive or wrong-role user', null],
  ])('rejects a start that confirms zero rows (%s)', async () => {
    repository.startSession.mockResolvedValue(null);

    await expect(service.start('user-1', 'ADMIN', draft)).rejects.toThrow(
      SessionStartRejectedError,
    );
  });

  it('validates a session by joining the open unexpired session with its active owner', async () => {
    const identity = { ...userSummary, jti: draft.id };
    repository.findValidSessionWithUser.mockResolvedValue(identity);

    await expect(service.validate(draft.id, userSummary.id)).resolves.toBe(
      identity,
    );
    expect(repository.findValidSessionWithUser).toHaveBeenCalledWith(
      draft.id,
      userSummary.id,
      expect.any(Date),
    );
  });

  it('returns null for invalid, missing, ended, expired or wrong-owner sessions', async () => {
    repository.findValidSessionWithUser.mockResolvedValue(null);

    await expect(service.validate(draft.id, 'other-user')).resolves.toBeNull();
  });

  it('heartbeats only within the open window of the owning session', async () => {
    const later = new Date(now.getTime() + 60 * 1000);
    repository.heartbeatSession.mockResolvedValue(true);

    await expect(
      service.heartbeat(draft.id, userSummary.id, later),
    ).resolves.toBe(true);
    expect(repository.heartbeatSession).toHaveBeenCalledWith(
      draft.id,
      userSummary.id,
      later,
    );
  });

  it('ends the current session with LOGOUT before any cookie is cleared', async () => {
    const later = new Date(now.getTime() + 60 * 1000);
    repository.endSession.mockResolvedValue(true);

    await expect(service.end(draft.id, userSummary.id, later)).resolves.toBe(
      true,
    );
    expect(repository.endSession).toHaveBeenCalledWith(
      draft.id,
      userSummary.id,
      later,
      'LOGOUT',
    );
  });

  it('expires due sessions using the captured instant', async () => {
    repository.expireSessions.mockResolvedValue(2);

    await expect(service.expire(now)).resolves.toBe(2);
    expect(repository.expireSessions).toHaveBeenCalledWith(now);
  });

  it('retains sessions for exactly thirty days before deletion', async () => {
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    repository.deleteSessionsEndedBefore.mockResolvedValue(3);

    await expect(service.deleteRetained(now)).resolves.toBe(3);
    expect(repository.deleteSessionsEndedBefore).toHaveBeenCalledWith(cutoff);
  });
});

describe(`${SessionsRepository.name} identity selection`, () => {
  it('loads the administrative profile and participant reset state with a session identity', async () => {
    type FindUniqueArgs = {
      where: { id: string };
      select: Record<string, boolean>;
    };
    type AdminIdentity = Omit<typeof userSummary, 'role' | 'adminProfile'> & {
      role: 'ADMIN';
      adminProfile: 'SHOP';
    };
    const findUnique = jest.fn<Promise<AdminIdentity>, [FindUniqueArgs]>();
    const transaction = {
      user: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique,
      },
      userSession: { create: jest.fn().mockResolvedValue(undefined) },
    };
    findUnique.mockResolvedValue({
      ...userSummary,
      id: 'admin-1',
      role: 'ADMIN',
      adminProfile: 'SHOP',
      passwordResetRequired: false,
      passwordResetExpiresAt: null,
    });
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation((callback: (tx: typeof transaction) => unknown) =>
          callback(transaction),
        ),
    };
    const repository = new SessionsRepository(prisma as never);

    const identity = await repository.startSession('admin-1', 'ADMIN', draft);

    expect(identity?.adminProfile).toBe('SHOP');
    expect(transaction.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'admin-1', role: 'ADMIN', isActive: true },
      data: { lastLoginAt: draft.startedAt },
    });
    const findUniqueArgs = findUnique.mock.calls[0]?.[0];
    expect(findUniqueArgs?.where).toEqual({ id: 'admin-1' });
    expect(findUniqueArgs?.select.adminProfile).toBe(true);
    expect(findUniqueArgs?.select.passwordResetRequired).toBe(true);
    expect(findUniqueArgs?.select.passwordResetExpiresAt).toBe(true);
  });

  it('keeps participant profile null and validates only an active session owner', async () => {
    type SessionLookupArgs = {
      where: Record<string, unknown>;
      select: { user: { select: Record<string, boolean> } };
    };
    const findFirst = jest.fn<
      Promise<{ user: typeof userSummary } | null>,
      [SessionLookupArgs]
    >();
    findFirst.mockResolvedValue({ user: userSummary });
    const repository = new SessionsRepository({
      userSession: { findFirst },
    } as never);

    const identity = await repository.findValidSessionWithUser(
      draft.id,
      userSummary.id,
      now,
    );

    expect(identity?.adminProfile).toBeNull();
    const findFirstArgs = findFirst.mock.calls[0]?.[0];
    expect(findFirstArgs?.where.user).toEqual({ is: { isActive: true } });
    expect(findFirstArgs?.select.user.select.adminProfile).toBe(true);
    expect(findFirstArgs?.select.user.select.passwordResetRequired).toBe(true);
    expect(findFirstArgs?.select.user.select.passwordResetExpiresAt).toBe(true);
  });
});
