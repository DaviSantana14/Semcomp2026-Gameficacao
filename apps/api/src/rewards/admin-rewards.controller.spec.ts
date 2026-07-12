import { UserRole } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DECORATORS } from '@nestjs/swagger/dist/constants';
import { ROLES_KEY } from '../auth/roles.decorator';
import { PaginationMetaDto } from '../common/dto/pagination-response.dto';
import { AdminRewardsController } from './admin-rewards.controller';
import { AdminRewardsQueryDto } from './dto/admin-rewards-query.dto';
import { AdminRedemptionsQueryDto } from './dto/admin-redemptions-query.dto';
import { AdminRewardsPageResponseDto } from './dto/admin-reward-response.dto';

describe('AdminRewardsController', () => {
  it('guards the whole controller as admin', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminRewardsController)).toEqual([
      UserRole.ADMIN,
    ]);
  });

  it('delegates catalog and history queries', async () => {
    const service = {
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

function readSwaggerMetadata(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Expected Swagger property metadata.');
  }
  return value as Record<string, unknown>;
}
