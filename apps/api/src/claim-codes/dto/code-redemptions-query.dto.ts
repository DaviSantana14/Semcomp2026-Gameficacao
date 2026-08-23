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

export enum CodeRedemptionMethodFilter {
  ALL = 'all',
  REUSABLE_CODE = 'reusable_code',
  CLAIM_CODE = 'claim_code',
  REUSABLE = 'reusable',
  CLAIM = 'claim',
}

export type CodeRedemptionMethodValue = 'REUSABLE_CODE' | 'CLAIM_CODE';

export function mapCodeRedemptionMethod(
  method: CodeRedemptionMethodFilter | undefined,
): CodeRedemptionMethodValue | undefined {
  switch (method) {
    case CodeRedemptionMethodFilter.REUSABLE_CODE:
    case CodeRedemptionMethodFilter.REUSABLE:
      return 'REUSABLE_CODE';
    case CodeRedemptionMethodFilter.CLAIM_CODE:
    case CodeRedemptionMethodFilter.CLAIM:
      return 'CLAIM_CODE';
    default:
      return undefined;
  }
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeLowercase(value: unknown) {
  const normalized = normalizeString(value);
  return typeof normalized === 'string' ? normalized.toLowerCase() : normalized;
}

export class CodeRedemptionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeString(value))
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeString(value))
  @IsString()
  actionId?: string;

  @ApiPropertyOptional({ enum: CodeRedemptionMethodFilter })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => normalizeLowercase(value))
  @IsEnum(CodeRedemptionMethodFilter)
  method: CodeRedemptionMethodFilter = CodeRedemptionMethodFilter.ALL;

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
