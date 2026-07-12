import { Transform } from 'class-transformer';
import { ActionType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum ActionStatusFilter {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export class AdminActionsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(ActionStatusFilter)
  status?: ActionStatusFilter;

  @IsOptional()
  @IsEnum(ActionType)
  type?: ActionType;
}
