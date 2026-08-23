import {
  PointEventKind,
  PointEventSource,
  RedemptionStatus,
} from '@prisma/client';
import { toRewardRedemptionResponseDto } from '../dto/reward-redemption-response.dto';

describe('operational reward redemption response', () => {
  it('serializes only participant id and name', () => {
    const response = toRewardRedemptionResponseDto({
      id: 'redemption-1',
      userId: 'participant-1',
      rewardId: 'reward-1',
      pointsSpent: 50,
      status: RedemptionStatus.PENDING,
      deliveredAt: null,
      deliveredByAdminId: null,
      cancelledAt: null,
      cancelledByAdminId: null,
      pointEvents: [
        {
          id: 'event-1',
          points: -50,
          xpDelta: 0,
          kind: PointEventKind.DEBIT,
          source: PointEventSource.REWARD_REDEMPTION,
          rewardRedemptionId: 'redemption-1',
          description: 'Resgate',
          createdAt: new Date('2026-08-23T12:00:00.000Z'),
        },
      ],
      user: {
        id: 'participant-1',
        name: 'Ada',
        email: 'ada@example.test',
      },
      reward: {
        id: 'reward-1',
        name: 'Camiseta',
        description: null,
        costInPoints: 50,
        stock: 2,
        isActive: true,
        imageUrl: null,
        createdAt: new Date('2026-08-23T12:00:00.000Z'),
        updatedAt: new Date('2026-08-23T12:00:00.000Z'),
      },
      createdAt: new Date('2026-08-23T12:00:00.000Z'),
      updatedAt: new Date('2026-08-23T12:00:00.000Z'),
    });

    expect(response.user).toEqual({ id: 'participant-1', name: 'Ada' });
    expect(response.user).not.toHaveProperty('email');
    expect(JSON.stringify(response)).not.toContain('ada@example.test');
  });
});
