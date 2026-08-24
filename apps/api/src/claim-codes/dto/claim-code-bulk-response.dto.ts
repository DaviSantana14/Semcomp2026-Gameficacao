import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../common/dto/pagination-response.dto';
import { ClaimCodeBulkOutcome } from '../claim-code-bulk-outcome';

export type ClaimCodeBulkCounts = {
  selected: number;
  changed: number;
  unchanged: number;
  used: number;
  notFound: number;
};

export type ClaimCodeBulkOperationItem = {
  requestedClaimCodeId: string;
  claimCodeId: string | null;
  maskedCode: string | null;
  outcome: ClaimCodeBulkOutcome;
};

export type ClaimCodeBulkOperationSummary = {
  id: string;
  actor: { id: string; name: string; email: string };
  targetIsActive: boolean;
  reason: string;
  requestId: string;
  counts: ClaimCodeBulkCounts;
  createdAt: string;
};

export type ClaimCodeBulkOperationDetail = ClaimCodeBulkOperationSummary & {
  items: ClaimCodeBulkOperationItem[];
};

class ClaimCodeBulkCountsDto implements ClaimCodeBulkCounts {
  @ApiProperty() selected!: number;
  @ApiProperty() changed!: number;
  @ApiProperty() unchanged!: number;
  @ApiProperty() used!: number;
  @ApiProperty() notFound!: number;
}

class ClaimCodeBulkActorDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
}

export class ClaimCodeBulkOperationItemDto implements ClaimCodeBulkOperationItem {
  @ApiProperty() requestedClaimCodeId!: string;
  @ApiPropertyOptional({ nullable: true, type: String })
  claimCodeId!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  maskedCode!: string | null;
  @ApiProperty({ enum: ClaimCodeBulkOutcome })
  outcome!: ClaimCodeBulkOutcome;
}

export class ClaimCodeBulkOperationResponseDto implements ClaimCodeBulkOperationDetail {
  @ApiProperty() id!: string;
  @ApiProperty({ type: ClaimCodeBulkActorDto })
  actor!: ClaimCodeBulkOperationSummary['actor'];
  @ApiProperty() targetIsActive!: boolean;
  @ApiProperty() reason!: string;
  @ApiProperty() requestId!: string;
  @ApiProperty({ type: ClaimCodeBulkCountsDto })
  counts!: ClaimCodeBulkCounts;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: [ClaimCodeBulkOperationItemDto] })
  items!: ClaimCodeBulkOperationItem[];
}

export class ClaimCodeBulkOperationSummaryResponseDto implements ClaimCodeBulkOperationSummary {
  @ApiProperty() id!: string;
  @ApiProperty({ type: ClaimCodeBulkActorDto })
  actor!: ClaimCodeBulkOperationSummary['actor'];
  @ApiProperty() targetIsActive!: boolean;
  @ApiProperty() reason!: string;
  @ApiProperty() requestId!: string;
  @ApiProperty({ type: ClaimCodeBulkCountsDto })
  counts!: ClaimCodeBulkCounts;
  @ApiProperty() createdAt!: string;
}

export class ClaimCodeBulkOperationsPageResponseDto {
  @ApiProperty({ type: [ClaimCodeBulkOperationSummaryResponseDto] })
  items!: ClaimCodeBulkOperationSummary[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
