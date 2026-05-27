import { ApiProperty } from '@nestjs/swagger';
import { RedemptionStatus } from '@prisma/client';
import {
  RewardResponseDto,
  RewardResponseSource,
  toRewardResponseDto,
} from './reward-response.dto';

class RedemptionUserResponseDto {
  @ApiProperty({ example: 'clxuser123' })
  id: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  name: string;

  @ApiProperty({ example: 'ada@example.com' })
  email: string;

  constructor(data: RedemptionUserResponseSource) {
    this.id = data.id;
    this.name = data.name;
    this.email = data.email;
  }
}

export class RewardRedemptionResponseDto {
  @ApiProperty({ example: 'clxredemption123' })
  id: string;

  @ApiProperty({ example: 'clxuser123' })
  userId: string;

  @ApiProperty({ example: 'clxreward123' })
  rewardId: string;

  @ApiProperty({ example: 100 })
  pointsSpent: number;

  @ApiProperty({ enum: RedemptionStatus, example: RedemptionStatus.PENDING })
  status: RedemptionStatus;

  @ApiProperty({ type: RedemptionUserResponseDto })
  user: RedemptionUserResponseDto;

  @ApiProperty({ type: RewardResponseDto })
  reward: RewardResponseDto;

  @ApiProperty({ example: '2026-05-17T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-05-17T12:00:00.000Z' })
  updatedAt: Date;

  constructor(data: RewardRedemptionResponseSource) {
    this.id = data.id;
    this.userId = data.userId;
    this.rewardId = data.rewardId;
    this.pointsSpent = data.pointsSpent;
    this.status = data.status;
    this.user = new RedemptionUserResponseDto(data.user);
    this.reward = toRewardResponseDto(data.reward);
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }
}

type RedemptionUserResponseSource = {
  id: string;
  name: string;
  email: string;
};

export type RewardRedemptionResponseSource = {
  id: string;
  userId: string;
  rewardId: string;
  pointsSpent: number;
  status: RedemptionStatus;
  user: RedemptionUserResponseSource;
  reward: RewardResponseSource;
  createdAt: Date;
  updatedAt: Date;
};

export function toRewardRedemptionResponseDto(
  redemption: RewardRedemptionResponseSource,
) {
  return new RewardRedemptionResponseDto(redemption);
}
