import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum ReconciliationFilter {
  ALL = 'all',
  DIVERGENT = 'divergent',
}

export class ListReconciliationDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(ReconciliationFilter)
  filter: ReconciliationFilter = ReconciliationFilter.ALL;
}
