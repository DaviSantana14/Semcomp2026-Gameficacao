import { BadRequestException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { startOfOperationalDayUtc } from '../../common/operational-time';

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

export type RedemptionDateRange = { from?: Date; to?: Date };

export function parseRedemptionDateRange(
  query: Pick<AdminRedemptionsQueryDto, 'from' | 'to'>,
): RedemptionDateRange {
  if (query.from === undefined && query.to === undefined) return {};
  if (query.from === undefined || query.to === undefined) {
    throw new BadRequestException(
      'from e to devem ser informados juntos para filtrar o período.',
    );
  }

  const from = parseOperationalDate(query.from, 'from');
  const to = parseOperationalDate(query.to, 'to');
  if (from.getTime() >= to.getTime()) {
    throw new BadRequestException(
      'O início do período deve ser anterior ao fim do período.',
    );
  }
  return { from, to };
}

function parseOperationalDate(value: string, field: 'from' | 'to') {
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException(`${field} não representa uma data válida.`);
  }
  return startOfOperationalDayUtc(parsed);
}
