import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export enum AdminParticipantRedemptionStatusFilter {
  ALL = 'all',
  PENDING = 'pending',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

export class AdminParticipantRedemptionsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(AdminParticipantRedemptionStatusFilter)
  status?: AdminParticipantRedemptionStatusFilter;
}
