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
    const result = await repository.withTransaction((transactional) =>
      transactional.findActionById('action-1'),
    );
    expect(result).toEqual({ id: 'action-1' });
    expect(transaction.action.findUnique.mock.calls).toHaveLength(1);
    expect(prisma.action.findUnique.mock.calls).toHaveLength(0);
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
    const result = await repository.withTransaction((transactional) =>
      transactional.findRewardById('reward-1'),
    );
    expect(result).toEqual({ id: 'reward-1' });
    expect(transaction.reward.findUnique.mock.calls).toHaveLength(1);
    expect(prisma.reward.findUnique.mock.calls).toHaveLength(0);
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
    const result = await repository.withTransaction((transactional) =>
      transactional.findClaimCodeById('claim-code-1'),
    );
    expect(result).toEqual({ id: 'claim-code-1' });
    expect(transaction.claimCode.findUnique.mock.calls).toHaveLength(1);
    expect(prisma.claimCode.findUnique.mock.calls).toHaveLength(0);
  });
});

describe(UsersRepository.name, () => {
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
