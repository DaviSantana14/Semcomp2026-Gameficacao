import { ApiProperty } from '@nestjs/swagger';
import { RewardRedemptionResponseDto } from './reward-redemption-response.dto';
import { PaginationMetaDto } from '../../common/dto/pagination-response.dto';

export class AdminRedemptionListResponseDto extends RewardRedemptionResponseDto {}

export class AdminRedemptionsPageResponseDto {
  @ApiProperty({ type: AdminRedemptionListResponseDto, isArray: true })
  items!: AdminRedemptionListResponseDto[];
  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
