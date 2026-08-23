import { Prisma } from '@prisma/client';
import { ActionsRepository } from '../../actions/actions.repository';
import { ClaimCodesRepository } from '../../claim-codes/claim-codes.repository';
import { RewardsRepository } from '../../rewards/rewards.repository';
import { UsersRepository } from '../../users/users.repository';
import { PersistenceUniqueConstraintError } from '../persistence-errors';

describe('semantic repository transactions', () => {
  it('binds ActionsRepository to the transaction client', async () => {
    const transaction = {
      action: { findUnique: jest.fn().mockResolvedValue({ id: 'action-1' }) },
    };
    const prisma = {
      action: { findUnique: jest.fn() },
      $transaction: jest.fn(
        (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const repository = new ActionsRepository(prisma as never);
    let exposedTransaction: unknown;
    const result = await repository.withTransaction((transactional, tx) => {
      exposedTransaction = tx;
      return transactional.findActionById('action-1');
    });
    expect(result).toEqual({ id: 'action-1' });
    expect(transaction.action.findUnique.mock.calls).toHaveLength(1);
    expect(prisma.action.findUnique.mock.calls).toHaveLength(0);
    expect(exposedTransaction).toBe(transaction);
  });

  it('binds RewardsRepository to the transaction client', async () => {
    const transaction = {
      reward: { findUnique: jest.fn().mockResolvedValue({ id: 'reward-1' }) },
    };
    const prisma = {
      reward: { findUnique: jest.fn() },
      $transaction: jest.fn(
        (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const repository = new RewardsRepository(prisma as never);
    let exposedTransaction: unknown;
    const result = await repository.withTransaction((transactional, tx) => {
      exposedTransaction = tx;
      return transactional.findRewardById('reward-1');
    });
    expect(result).toEqual({ id: 'reward-1' });
    expect(transaction.reward.findUnique.mock.calls).toHaveLength(1);
    expect(prisma.reward.findUnique.mock.calls).toHaveLength(0);
    expect(exposedTransaction).toBe(transaction);
  });

  it('binds ClaimCodesRepository to the transaction client', async () => {
    const transaction = {
      claimCode: {
        findUnique: jest.fn().mockResolvedValue({ id: 'claim-code-1' }),
      },
    };
    const prisma = {
      claimCode: { findUnique: jest.fn() },
      $transaction: jest.fn(
        (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const repository = new ClaimCodesRepository(prisma as never);
    let exposedTransaction: unknown;
    const result = await repository.withTransaction((transactional, tx) => {
      exposedTransaction = tx;
      return transactional.findClaimCodeById('claim-code-1');
    });
    expect(result).toEqual({ id: 'claim-code-1' });
    expect(transaction.claimCode.findUnique.mock.calls).toHaveLength(1);
    expect(prisma.claimCode.findUnique.mock.calls).toHaveLength(0);
    expect(exposedTransaction).toBe(transaction);
  });

  it('binds the claim-code audit writer to the same transaction client', async () => {
    const transaction = {
      claimCode: { findUnique: jest.fn() },
      adminAuditEvent: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const auditRepository = {
      bindTransaction: jest.fn().mockReturnValue({ create: jest.fn() }),
    };
    const repository = new ClaimCodesRepository(
      prisma as never,
      auditRepository as never,
    );

    await repository.withTransaction((transactional) => {
      expect(transactional.auditWriter).toBeDefined();
      return Promise.resolve();
    });

    expect(auditRepository.bindTransaction).toHaveBeenCalledWith(transaction);
  });
});

describe(UsersRepository.name, () => {
  it('locks the general admin, restores it, and revokes its open sessions atomically', async () => {
    type UserUpdateArgs = {
      where: { id: string };
      data: {
        passwordHash: string;
        passwordChangedAt: Date;
        isActive: boolean;
        passwordResetRequired: boolean;
        passwordResetExpiresAt: null;
      };
    };
    type SessionUpdateArgs = {
      where: {
        userId: string;
        endedAt: null;
        expiresAt: { gt: Date };
      };
      data: { endedAt: Date; endReason: 'REVOKED' };
    };
    const queryRaw = jest
      .fn<Promise<Array<{ id: string }>>, [unknown]>()
      .mockResolvedValue([{ id: 'admin-1' }]);
    const userUpdate = jest
      .fn<Promise<unknown>, [UserUpdateArgs]>()
      .mockResolvedValue({});
    const sessionUpdateMany = jest
      .fn<Promise<{ count: number }>, [SessionUpdateArgs]>()
      .mockResolvedValue({ count: 1 });
    const transaction = {
      $queryRaw: queryRaw,
      user: { update: userUpdate },
      userSession: { updateMany: sessionUpdateMany },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof transaction) => Promise<boolean>) =>
          callback(transaction),
      ),
    };
    const repository = new UsersRepository(prisma as never);

    await expect(
      repository.setAdminPassword(
        '52998224725',
        'admin@example.com',
        '$2b$12$new-hash',
      ),
    ).resolves.toBe(true);

    expect(queryRaw).toHaveBeenCalledTimes(1);
    const updateArgs = userUpdate.mock.calls[0]?.[0];
    expect(updateArgs?.where).toEqual({ id: 'admin-1' });
    expect(updateArgs?.data.passwordHash).toBe('$2b$12$new-hash');
    expect(updateArgs?.data.passwordChangedAt).toBeInstanceOf(Date);
    expect(updateArgs?.data.isActive).toBe(true);
    expect(updateArgs?.data.passwordResetRequired).toBe(false);
    expect(updateArgs?.data.passwordResetExpiresAt).toBeNull();

    const sessionArgs = sessionUpdateMany.mock.calls[0]?.[0];
    expect(sessionArgs?.where.userId).toBe('admin-1');
    expect(sessionArgs?.where.endedAt).toBeNull();
    expect(sessionArgs?.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(sessionArgs?.data.endedAt).toBeInstanceOf(Date);
    expect(sessionArgs?.data.endReason).toBe('REVOKED');
  });

  it('does not mutate anything when no general admin matches the bootstrap identity', async () => {
    const queryRaw = jest
      .fn<Promise<Array<{ id: string }>>, [unknown]>()
      .mockResolvedValue([]);
    const userUpdate = jest.fn();
    const sessionUpdateMany = jest.fn();
    const transaction = {
      $queryRaw: queryRaw,
      user: { update: userUpdate },
      userSession: { updateMany: sessionUpdateMany },
    };
    const prisma = {
      $transaction: jest.fn(
        (callback: (client: typeof transaction) => Promise<boolean>) =>
          callback(transaction),
      ),
    };
    const repository = new UsersRepository(prisma as never);

    await expect(
      repository.setAdminPassword(
        '52998224725',
        'admin@example.com',
        '$2b$12$new-hash',
      ),
    ).resolves.toBe(false);
    expect(userUpdate).not.toHaveBeenCalled();
    expect(sessionUpdateMany).not.toHaveBeenCalled();
  });

  it('translates Prisma uniqueness failures to a neutral persistence error', async () => {
    const prisma = {
      user: {
        create: jest.fn().mockRejectedValue(
          new Prisma.PrismaClientKnownRequestError('duplicate', {
            code: 'P2002',
            clientVersion: '7.8.0',
          }),
        ),
      },
    };
    const repository = new UsersRepository(prisma as never);
    await expect(
      repository.create({ name: 'Ada', cpf: '123', email: 'ada@example.com' }),
    ).rejects.toBeInstanceOf(PersistenceUniqueConstraintError);
  });
});
