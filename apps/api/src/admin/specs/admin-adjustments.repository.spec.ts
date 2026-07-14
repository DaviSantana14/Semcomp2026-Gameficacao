import { Prisma } from '@prisma/client';
import { PersistenceUniqueConstraintError } from '../../common/persistence-errors';
import { AdminAdjustmentsRepository } from '../admin-adjustments.repository';

describe(AdminAdjustmentsRepository.name, () => {
  const transaction = {
    $queryRaw: jest.fn(),
    pointEvent: { findUnique: jest.fn(), create: jest.fn() },
    user: { update: jest.fn() },
    adminAuditEvent: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(),
    pointEvent: { findUnique: jest.fn() },
  };
  const auditWriter = { create: jest.fn() };
  const auditRepository = {
    bindTransaction: jest.fn().mockReturnValue(auditWriter),
  };
  let repository: AdminAdjustmentsRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
    repository = new AdminAdjustmentsRepository(
      prisma as never,
      auditRepository as never,
    );
  });

  it('binds lock, reads and writes to the same interactive transaction', async () => {
    transaction.$queryRaw.mockResolvedValue([
      {
        id: 'participant-1',
        points: 10,
        xp: 5,
        level: 3,
        isActive: true,
        role: 'PARTICIPANT',
      },
    ]);
    transaction.pointEvent.findUnique.mockResolvedValue(null);
    transaction.pointEvent.create.mockResolvedValue({ id: 'event-1' });
    transaction.user.update.mockResolvedValue({
      id: 'participant-1',
      points: 11,
      xp: 6,
      level: 3,
    });

    await repository.withTransaction(async (tx) => {
      expect(tx.auditWriter).toBe(auditWriter);
      await tx.lockParticipant('participant-1');
      await tx.findByIdempotencyKey('key-1');
      await tx.createPointEvent({
        id: 'event-1',
        userId: 'participant-1',
        points: 1,
        xpDelta: 1,
        kind: 'CREDIT',
        source: 'ADMIN_GRANT',
        actorAdminId: 'admin-1',
        idempotencyKey: 'key-1',
        auditEventId: 'audit-1',
        description: 'Correcao operacional confirmada',
      });
      await tx.updateParticipantBalance('participant-1', 1, 1);
    });

    expect(auditRepository.bindTransaction).toHaveBeenCalledWith(transaction);
    const rawCalls = transaction.$queryRaw.mock.calls as unknown as Array<
      [string[], string]
    >;
    const rawTemplate = rawCalls[0][0];
    expect(rawTemplate.join('?')).toContain('FOR UPDATE');
    expect(rawCalls[0][1]).toBe('participant-1');
    expect(transaction.pointEvent.findUnique).toHaveBeenCalled();
    expect(transaction.pointEvent.create).toHaveBeenCalled();
    expect(transaction.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          points: { increment: 1 },
          xp: { increment: 1 },
        },
        select: { id: true, points: true, xp: true, level: true },
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });
  });

  it('translates expected transaction uniqueness failures', async () => {
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '7.8.0',
        meta: { target: ['idempotencyKey'] },
      }),
    );

    await expect(
      repository.withTransaction(() => Promise.resolve(undefined)),
    ).rejects.toBeInstanceOf(PersistenceUniqueConstraintError);
  });
});
