import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum AdminRewardStatusFilter {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}
export enum AdminRewardStockFilter {
  IN_STOCK = 'in_stock',
  OUT_OF_STOCK = 'out_of_stock',
}

export class AdminRewardsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(AdminRewardStatusFilter)
  status?: AdminRewardStatusFilter;
  @IsOptional() @IsEnum(AdminRewardStockFilter) stock?: AdminRewardStockFilter;
}
