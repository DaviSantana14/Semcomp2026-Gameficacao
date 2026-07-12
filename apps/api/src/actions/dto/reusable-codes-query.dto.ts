import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ReusableCodesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(['all', 'active', 'disabled', 'blocked'])
  status?: 'all' | 'active' | 'disabled' | 'blocked';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  actionId?: string;
}

export class ReusableCodeRedemptionsQueryDto extends PaginationQueryDto {}
