import { ApiProperty } from '@nestjs/swagger';
import {
  PointEventKind,
  PointEventSource,
  RedemptionStatus,
} from '@prisma/client';
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

  constructor(data: RedemptionUserResponseSource) {
    this.id = data.id;
    this.name = data.name;
  }
}

export class RedemptionPointEventResponseDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  points: number;
  @ApiProperty()
  xpDelta: number;
  @ApiProperty({ enum: PointEventKind })
  kind: PointEventKind;
  @ApiProperty({ enum: PointEventSource })
  source: PointEventSource;
  @ApiProperty({ nullable: true })
  rewardRedemptionId: string | null;
  @ApiProperty({ nullable: true })
  description: string | null;
  @ApiProperty()
  createdAt: Date;

  constructor(data: RedemptionPointEventResponseSource) {
    this.id = data.id;
    this.points = data.points;
    this.xpDelta = data.xpDelta;
    this.kind = data.kind;
    this.source = data.source;
    this.rewardRedemptionId = data.rewardRedemptionId;
    this.description = data.description;
    this.createdAt = data.createdAt;
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

  @ApiProperty({ nullable: true, example: '2026-05-17T14:00:00.000Z' })
  deliveredAt: Date | null;

  @ApiProperty({ nullable: true, example: 'clxadmin123' })
  deliveredByAdminId: string | null;

  @ApiProperty({ nullable: true, example: '2026-05-17T14:00:00.000Z' })
  cancelledAt: Date | null;

  @ApiProperty({ nullable: true, example: 'clxadmin123' })
  cancelledByAdminId: string | null;

  @ApiProperty({ isArray: true, type: RedemptionPointEventResponseDto })
  pointEvents: RedemptionPointEventResponseDto[];

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
    this.deliveredAt = data.deliveredAt ?? null;
    this.deliveredByAdminId = data.deliveredByAdminId ?? null;
    this.cancelledAt = data.cancelledAt ?? null;
    this.cancelledByAdminId = data.cancelledByAdminId ?? null;
    this.pointEvents = (data.pointEvents ?? []).map(
      (event) => new RedemptionPointEventResponseDto(event),
    );
    this.user = new RedemptionUserResponseDto(data.user);
    this.reward = toRewardResponseDto(data.reward);
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }
}

type RedemptionUserResponseSource = {
  id: string;
  name: string;
};

export type RewardRedemptionResponseSource = {
  id: string;
  userId: string;
  rewardId: string;
  pointsSpent: number;
  status: RedemptionStatus;
  deliveredAt: Date | null;
  deliveredByAdminId: string | null;
  cancelledAt: Date | null;
  cancelledByAdminId: string | null;
  pointEvents: RedemptionPointEventResponseSource[];
  user: RedemptionUserResponseSource;
  reward: RewardResponseSource;
  createdAt: Date;
  updatedAt: Date;
};

export type RedemptionPointEventResponseSource = {
  id: string;
  points: number;
  xpDelta: number;
  kind: PointEventKind;
  source: PointEventSource;
  rewardRedemptionId: string | null;
  description: string | null;
  createdAt: Date;
};

export function toRewardRedemptionResponseDto(
  redemption: RewardRedemptionResponseSource,
) {
  return new RewardRedemptionResponseDto(redemption);
}
