import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ActionRedemptionMethod,
  PointEventKind,
  PointEventSource,
} from '@prisma/client';
import { PaginationMetaDto } from '../../common/dto/pagination-response.dto';

class PointEventParticipantDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
}

class PointEventActionDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

class PointEventClaimCodeDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Código sempre mascarado.' }) code!: string;
}

class PointEventRewardDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

class PointEventActorDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export enum PointEventReferenceType {
  ACTION = 'ACTION',
  REWARD = 'REWARD',
  AUDIT = 'AUDIT',
  DESCRIPTION = 'DESCRIPTION',
  POINT_EVENT = 'POINT_EVENT',
}

class PointEventReferenceDto {
  @ApiProperty({ enum: PointEventReferenceType })
  type!: PointEventReferenceType;
  @ApiProperty() label!: string;
}

export class AdminPointEventResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: PointEventParticipantDto })
  participant!: PointEventParticipantDto;
  @ApiProperty() points!: number;
  @ApiProperty() xpDelta!: number;
  @ApiProperty({ enum: PointEventKind }) kind!: PointEventKind;
  @ApiProperty({ enum: PointEventSource }) source!: PointEventSource;
  @ApiPropertyOptional({ enum: ActionRedemptionMethod, nullable: true })
  redemptionMethod!: ActionRedemptionMethod | null;
  @ApiProperty({ type: PointEventReferenceDto })
  reference!: PointEventReferenceDto;
  @ApiPropertyOptional({ type: PointEventActionDto, nullable: true })
  action!: PointEventActionDto | null;
  @ApiPropertyOptional({ type: PointEventClaimCodeDto, nullable: true })
  claimCode!: PointEventClaimCodeDto | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Código sempre mascarado.',
  })
  code!: string | null;
  @ApiPropertyOptional({ type: PointEventRewardDto, nullable: true })
  reward!: PointEventRewardDto | null;
  @ApiPropertyOptional({ type: PointEventActorDto, nullable: true })
  actor!: PointEventActorDto | null;
  @ApiPropertyOptional({ nullable: true })
  auditOperation!: string | null;
  @ApiProperty() origin!: string;
  @ApiProperty() isAudited!: boolean;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiPropertyOptional({ nullable: true })
  reversalOfPointEventId!: string | null;
  @ApiPropertyOptional({ nullable: true })
  reversalPointEventId!: string | null;
  @ApiProperty() createdAt!: string;
}

export class AdminPointEventsPageResponseDto {
  @ApiProperty({ type: [AdminPointEventResponseDto] })
  items!: AdminPointEventResponseDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}
