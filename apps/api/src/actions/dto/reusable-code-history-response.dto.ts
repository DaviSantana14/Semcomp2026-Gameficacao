import { ActionType } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../common/dto/pagination-response.dto';
import { AdminActionResponseDto } from './admin-action-response.dto';

export { PaginationMetaDto } from '../../common/dto/pagination-response.dto';

export enum ReusableCodeStatus {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
  BLOCKED_BY_ACTION = 'BLOCKED_BY_ACTION',
}

export class ReusableCodeHistoryResponseDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty({ enum: ActionType })
  type!: ActionType;
  @ApiProperty()
  code!: string;
  @ApiProperty()
  points!: number;
  @ApiProperty({ enum: ReusableCodeStatus })
  status!: ReusableCodeStatus;
  @ApiProperty()
  totalUses!: number;
  @ApiProperty({ nullable: true, type: String })
  lastUsedAt!: string | null;
}

export class ReusableCodeParticipantResponseDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty()
  email!: string;
  @ApiProperty()
  cpf!: string;
}

export class ReusableCodeRedemptionResponseDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  points!: number;
  @ApiProperty()
  createdAt!: string;
  @ApiProperty({ type: ReusableCodeParticipantResponseDto })
  participant!: ReusableCodeParticipantResponseDto;
}

export class AdminActionsPageResponseDto {
  @ApiProperty({ type: [AdminActionResponseDto] })
  items!: AdminActionResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class ReusableCodesPageResponseDto {
  @ApiProperty({ type: [ReusableCodeHistoryResponseDto] })
  items!: ReusableCodeHistoryResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class ReusableCodeRedemptionsPageResponseDto {
  @ApiProperty({ type: [ReusableCodeRedemptionResponseDto] })
  items!: ReusableCodeRedemptionResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
