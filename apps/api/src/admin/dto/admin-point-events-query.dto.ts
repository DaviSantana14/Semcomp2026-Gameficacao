import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum AdminPointEventSourceFilter {
  ALL = 'all',
  ACTION_REDEEM = 'action_redeem',
  ADMIN_GRANT = 'admin_grant',
  ADMIN_ADJUST = 'admin_adjust',
  REWARD_REDEMPTION = 'reward_redemption',
}

export enum AdminPointEventKindFilter {
  ALL = 'all',
  CREDIT = 'credit',
  DEBIT = 'debit',
}

export enum AdminPointEventMethodFilter {
  ALL = 'all',
  DIRECT = 'direct',
  REUSABLE_CODE = 'reusable_code',
  CLAIM_CODE = 'claim_code',
  LEGACY_UNKNOWN = 'legacy_unknown',
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeLowercase(value: unknown) {
  const normalized = normalizeString(value);
  return typeof normalized === 'string' ? normalized.toLowerCase() : normalized;
}

export class AdminPointEventsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeString(value))
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: AdminPointEventSourceFilter })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeLowercase(value))
  @IsEnum(AdminPointEventSourceFilter)
  source: AdminPointEventSourceFilter = AdminPointEventSourceFilter.ALL;

  @ApiPropertyOptional({ enum: AdminPointEventKindFilter })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeLowercase(value))
  @IsEnum(AdminPointEventKindFilter)
  kind: AdminPointEventKindFilter = AdminPointEventKindFilter.ALL;

  @ApiPropertyOptional({ enum: AdminPointEventMethodFilter })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeLowercase(value))
  @IsEnum(AdminPointEventMethodFilter)
  method: AdminPointEventMethodFilter = AdminPointEventMethodFilter.ALL;

  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'from deve estar no formato YYYY-MM-DD.',
  })
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-22' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'to deve estar no formato YYYY-MM-DD.',
  })
  to?: string;
}
