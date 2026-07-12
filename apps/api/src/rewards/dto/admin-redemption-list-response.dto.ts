import { ApiProperty } from '@nestjs/swagger';
import { RewardRedemptionResponseDto } from './reward-redemption-response.dto';

export class AdminRedemptionListResponseDto extends RewardRedemptionResponseDto {}

export class AdminRedemptionsPageResponseDto {
  @ApiProperty({ type: AdminRedemptionListResponseDto, isArray: true })
  items!: AdminRedemptionListResponseDto[];
  @ApiProperty() meta!: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
