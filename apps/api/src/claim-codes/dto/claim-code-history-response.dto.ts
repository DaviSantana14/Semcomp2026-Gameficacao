import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../actions/dto/reusable-code-history-response.dto';

export enum ClaimCodeStatus {
  AVAILABLE = 'AVAILABLE',
  DISABLED = 'DISABLED',
  BLOCKED_BY_ACTION = 'BLOCKED_BY_ACTION',
  USED = 'USED',
}

class ClaimCodeActionDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

class ClaimCodeUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
}

export class ClaimCodeHistoryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ enum: ClaimCodeStatus }) status!: ClaimCodeStatus;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() isUsed!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ nullable: true, type: String }) usedAt!: string | null;
  @ApiProperty({ type: ClaimCodeActionDto }) action!: ClaimCodeActionDto;
  @ApiProperty({ nullable: true, type: ClaimCodeUserDto })
  usedBy!: ClaimCodeUserDto | null;
}

export class ClaimCodesPageResponseDto {
  @ApiProperty({ type: [ClaimCodeHistoryResponseDto] })
  items!: ClaimCodeHistoryResponseDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}
