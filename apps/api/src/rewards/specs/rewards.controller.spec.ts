import { RedemptionStatus, UserRole } from '@prisma/client';
import { ROLES_KEY } from '../../auth/roles.decorator';
import { RewardsController } from '../rewards.controller';

describe('RewardsController player authorization', () => {
  it.each(['findAll', 'findById'] as const)(
    'restricts %s to participants',
    (methodName) => {
      const method = Object.getOwnPropertyDescriptor(
        RewardsController.prototype,
        methodName,
      )?.value as object;

      expect(Reflect.getMetadata(ROLES_KEY, method)).toEqual([
        UserRole.PARTICIPANT,
      ]);
    },
  );

  it('restricts reward redemption to participants', () => {
    const redeemMethod = Object.getOwnPropertyDescriptor(
      RewardsController.prototype,
      'redeem',
    )?.value as object;

    expect(Reflect.getMetadata(ROLES_KEY, redeemMethod)).toEqual([
      UserRole.PARTICIPANT,
    ]);
  });

  it('delegates redemption with reward and authenticated user ids', async () => {
    const redemption = {
      id: 'redemption-1',
      userId: 'user-1',
      rewardId: 'reward-1',
      pointsSpent: 25,
      status: RedemptionStatus.PENDING,
      createdAt: new Date('2026-07-11T12:00:00.000Z'),
      updatedAt: new Date('2026-07-11T12:00:00.000Z'),
      user: {
        id: 'user-1',
        name: 'Ada Lovelace',
        email: 'ada@example.test',
      },
      reward: {
        id: 'reward-1',
        name: 'Camiseta',
        description: null,
        costInPoints: 25,
        stock: 1,
        isActive: true,
        imageUrl: null,
        createdAt: new Date('2026-07-11T12:00:00.000Z'),
        updatedAt: new Date('2026-07-11T12:00:00.000Z'),
      },
    };
    const service = { redeem: jest.fn().mockResolvedValue(redemption) };
    const controller = new RewardsController(service as never);

    await controller.redeem('reward-1', { user: { id: 'user-1' } });

    expect(service.redeem).toHaveBeenCalledWith('reward-1', 'user-1');
  });
});
