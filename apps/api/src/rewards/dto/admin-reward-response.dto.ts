import { ApiProperty } from '@nestjs/swagger';
import { RedemptionStatus } from '@prisma/client';
import { RewardResponseDto } from './reward-response.dto';
import { PaginationMetaDto } from '../../common/dto/pagination-response.dto';

export class RedemptionStatusCountsDto {
  @ApiProperty() [RedemptionStatus.PENDING]!: number;
  @ApiProperty() [RedemptionStatus.DELIVERED]!: number;
  @ApiProperty() [RedemptionStatus.CANCELLED]!: number;
}

export class AdminRewardResponseDto extends RewardResponseDto {
  @ApiProperty({ type: RedemptionStatusCountsDto })
  redemptionCounts!: RedemptionStatusCountsDto;
}

export class AdminRewardsPageResponseDto {
  @ApiProperty({ type: AdminRewardResponseDto, isArray: true })
  items!: AdminRewardResponseDto[];
  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
