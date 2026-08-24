import { ApiPropertyOptional } from '@nestjs/swagger';
import { AdminProfile } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum AdminOperatorStateFilter {
  PENDING_ACTIVATION = 'PENDING_ACTIVATION',
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export class AdminOperatorsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: AdminProfile })
  @IsOptional()
  @IsEnum(AdminProfile)
  adminProfile?: AdminProfile;

  @ApiPropertyOptional({ enum: AdminOperatorStateFilter })
  @IsOptional()
  @IsEnum(AdminOperatorStateFilter)
  state?: AdminOperatorStateFilter;
}
