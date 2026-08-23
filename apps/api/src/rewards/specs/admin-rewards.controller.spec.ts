import { UserRole } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DECORATORS } from '@nestjs/swagger/dist/constants';
import { ROLES_KEY } from '../../auth/roles.decorator';
import { PaginationMetaDto } from '../../common/dto/pagination-response.dto';
import { AdminRewardsController } from '../admin-rewards.controller';
import { AdminRewardsQueryDto } from '../dto/admin-rewards-query.dto';
import { AdminRedemptionsQueryDto } from '../dto/admin-redemptions-query.dto';
import { AdminRewardsPageResponseDto } from '../dto/admin-reward-response.dto';
import { RedemptionTransitionDto } from '../dto/redemption-transition.dto';
import { toRewardRedemptionResponseDto } from '../dto/reward-redemption-response.dto';
import { HttpErrorResponseDto } from '../../common/dto/http-error-response.dto';
import { parseRedemptionDateRange } from '../dto/admin-redemptions-query.dto';

describe('AdminRewardsController', () => {
  it('guards the whole controller as admin', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminRewardsController)).toEqual([
      UserRole.ADMIN,
    ]);
  });

  it('delegates catalog and history queries', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 'reward-1' }),
      update: jest.fn().mockResolvedValue({ id: 'reward-1' }),
      findPendingRedemptions: jest.fn().mockResolvedValue([]),
      deliverRedemption: jest.fn().mockResolvedValue({ user: {}, reward: {} }),
      cancelRedemption: jest.fn().mockResolvedValue({ user: {}, reward: {} }),
      findAdminRewards: jest.fn().mockResolvedValue({ items: [], meta: {} }),
      findRedemptions: jest.fn().mockResolvedValue({ items: [], meta: {} }),
    };
    const controller = new AdminRewardsController(service as never);
    const query = { page: 1, limit: 20 };

    await controller.findRewards(query);
    await controller.findRedemptions(query);

    expect(service.findAdminRewards).toHaveBeenCalledWith(query);
    expect(service.findRedemptions).toHaveBeenCalledWith(query);
  });

  it('owns and delegates the legacy administrative reward endpoints', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 'reward-1' }),
      update: jest.fn().mockResolvedValue({ id: 'reward-1' }),
      findPendingRedemptions: jest.fn().mockResolvedValue([]),
      deliverRedemption: jest.fn().mockResolvedValue({ user: {}, reward: {} }),
      cancelRedemption: jest.fn().mockResolvedValue({ user: {}, reward: {} }),
    };
    const controller = new AdminRewardsController(service as never);
    const createDto = {
      reason: 'Inclusao aprovada pela coordenação',
      name: 'Camiseta',
      costInPoints: 25,
      stock: 5,
      isActive: true,
    };
    const updateDto = {
      reason: 'Reposicao aprovada pela coordenação',
      stock: 4,
    };
    const transitionDto = { reason: 'Atendimento confirmado pela coordenação' };
    const request = { user: { id: 'admin-1' }, requestId: 'request-1' };

    await controller.create(createDto, request as never);
    await controller.update('reward-1', updateDto, request as never);
    await controller.findPendingRedemptions();
    await controller.deliverRedemption(
      'redemption-1',
      transitionDto,
      request as never,
    );
    await controller.cancelRedemption(
      'redemption-1',
      transitionDto,
      request as never,
    );

    const context = { actorAdminId: 'admin-1', requestId: 'request-1' };
    expect(service.create).toHaveBeenCalledWith(createDto, context);
    expect(service.update).toHaveBeenCalledWith('reward-1', updateDto, context);
    expect(service.findPendingRedemptions).toHaveBeenCalledWith();
    expect(service.deliverRedemption).toHaveBeenCalledWith(
      'redemption-1',
      transitionDto,
      context,
    );
    expect(service.cancelRedemption).toHaveBeenCalledWith(
      'redemption-1',
      transitionDto,
      context,
    );
  });

  it.each(['deliverRedemption', 'cancelRedemption'] as const)(
    'documents conflict responses for %s races',
    (method) => {
      const handler = Object.getOwnPropertyDescriptor(
        AdminRewardsController.prototype,
        method,
      )?.value as object;
      const responses = Reflect.getMetadata(
        DECORATORS.API_RESPONSE,
        handler,
      ) as Record<number, { type?: unknown }>;

      expect(responses[409].type).toBe(HttpErrorResponseDto);
    },
  );
});

describe('RedemptionTransitionDto', () => {
  it('rejects a short reason', async () => {
    expect(
      await validate(
        plainToInstance(RedemptionTransitionDto, { reason: 'curto' }),
      ),
    ).not.toHaveLength(0);
  });
});

describe('RewardRedemptionResponseDto privacy', () => {
  it('copies associated point events through an explicit allowlist', () => {
    const response = toRewardRedemptionResponseDto({
      id: 'redemption-1',
      userId: 'user-1',
      rewardId: 'reward-1',
      pointsSpent: 50,
      status: 'PENDING',
      deliveredAt: null,
      deliveredByAdminId: null,
      cancelledAt: null,
      cancelledByAdminId: null,
      pointEvents: [
        {
          id: 'event-1',
          points: -50,
          xpDelta: 0,
          kind: 'DEBIT',
          source: 'REWARD_REDEMPTION',
          rewardRedemptionId: 'redemption-1',
          description: 'Resgate',
          createdAt: new Date('2026-07-14T12:00:00.000Z'),
          passwordHash: 'must-not-leak',
        } as never,
      ],
      user: { id: 'user-1', name: 'Ada', email: 'ada@example.test' },
      reward: {
        id: 'reward-1',
        name: 'Camiseta',
        description: null,
        costInPoints: 50,
        stock: 1,
        isActive: true,
        imageUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(response.pointEvents[0]).not.toHaveProperty('passwordHash');
    expect(Object.keys(response.pointEvents[0] ?? {}).sort()).toEqual([
      'createdAt',
      'description',
      'id',
      'kind',
      'points',
      'rewardRedemptionId',
      'source',
      'xpDelta',
    ]);
  });
});

describe('Admin rewards public query DTOs', () => {
  it.each(['all', 'active', 'inactive', 'out_of_stock'])(
    'accepts and normalizes reward status %s',
    async (status) => {
      const dto = plainToInstance(AdminRewardsQueryDto, {
        status: ` ${status.toUpperCase()} `,
      });
      expect(await validate(dto)).toHaveLength(0);
      expect(dto.status).toBe(status);
      expect(dto).not.toHaveProperty('stock');
    },
  );

  it.each(['all', 'pending', 'delivered', 'cancelled'])(
    'accepts and normalizes redemption status %s',
    async (status) => {
      const dto = plainToInstance(AdminRedemptionsQueryDto, {
        status: ` ${status.toUpperCase()} `,
      });
      expect(await validate(dto)).toHaveLength(0);
      expect(dto.status).toBe(status);
    },
  );

  it.each([
    [AdminRewardsQueryDto, 'in_stock'],
    [AdminRedemptionsQueryDto, 'PENDING_NOW'],
  ])('rejects unsupported public status values', async (Dto, status) => {
    expect(await validate(plainToInstance(Dto, { status }))).not.toHaveLength(
      0,
    );
  });

  it('publishes public enums and reusable pagination schema to Swagger', () => {
    const rewardStatus: unknown = Reflect.getMetadata(
      DECORATORS.API_MODEL_PROPERTIES,
      AdminRewardsQueryDto.prototype,
      'status',
    );
    const redemptionStatus: unknown = Reflect.getMetadata(
      DECORATORS.API_MODEL_PROPERTIES,
      AdminRedemptionsQueryDto.prototype,
      'status',
    );
    const meta: unknown = Reflect.getMetadata(
      DECORATORS.API_MODEL_PROPERTIES,
      AdminRewardsPageResponseDto.prototype,
      'meta',
    );

    expect(readSwaggerMetadata(rewardStatus).enum).toEqual([
      'all',
      'active',
      'inactive',
      'out_of_stock',
    ]);
    expect(readSwaggerMetadata(redemptionStatus).enum).toEqual([
      'all',
      'pending',
      'delivered',
      'cancelled',
    ]);
    expect(readSwaggerMetadata(meta).type).toBe(PaginationMetaDto);
  });
});

describe('Admin redemption date range', () => {
  it('maps date-only bounds to São Paulo midnight with an exclusive end', () => {
    expect(
      parseRedemptionDateRange({ from: '2026-08-01', to: '2026-08-03' }),
    ).toEqual({
      from: new Date('2026-08-01T03:00:00.000Z'),
      to: new Date('2026-08-03T03:00:00.000Z'),
    });
  });

  it.each([
    [{ from: '2026-08-01' }, 'missing end'],
    [{ to: '2026-08-03' }, 'missing start'],
    [{ from: '2026-08-03', to: '2026-08-03' }, 'empty range'],
    [{ from: '2026-08-04', to: '2026-08-03' }, 'reversed range'],
    [{ from: '2026-02-29', to: '2026-03-01' }, 'invalid date'],
  ])('rejects %s', (range) => {
    expect(() => parseRedemptionDateRange(range)).toThrow();
  });
});

function readSwaggerMetadata(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Expected Swagger property metadata.');
  }
  return value as Record<string, unknown>;
}
