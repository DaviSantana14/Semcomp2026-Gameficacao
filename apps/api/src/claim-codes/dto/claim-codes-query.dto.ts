import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ClaimCodesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(['all', 'available', 'disabled', 'blocked', 'used'])
  status?: 'all' | 'available' | 'disabled' | 'blocked' | 'used';

  @IsOptional()
  @IsString()
  actionId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MaxLength(100)
  search?: string;
}
