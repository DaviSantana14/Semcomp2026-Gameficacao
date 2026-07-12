import { Transform } from 'class-transformer';
import { RedemptionStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class AdminRedemptionsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(RedemptionStatus) status?: RedemptionStatus;
  @IsOptional() @IsString() rewardId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  search?: string;
}
