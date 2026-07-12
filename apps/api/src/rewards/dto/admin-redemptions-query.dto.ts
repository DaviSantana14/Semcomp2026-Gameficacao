import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum AdminRedemptionStatusFilter {
  ALL = 'all',
  PENDING = 'pending',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

export class AdminRedemptionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: AdminRedemptionStatusFilter,
    default: AdminRedemptionStatusFilter.ALL,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEnum(AdminRedemptionStatusFilter)
  status: AdminRedemptionStatusFilter = AdminRedemptionStatusFilter.ALL;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rewardId?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  search?: string;
}
