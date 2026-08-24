import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../common/dto/pagination-response.dto';

export type ClaimCodeBatchCounts = {
  available: number;
  disabled: number;
  used: number;
  blocked: number;
};

export type ClaimCodeBatchSummary = {
  id: string;
  action: { id: string; name: string };
  createdBy: { id: string; name: string; email: string };
  requestedQuantity: number;
  createdQuantity: number;
  reason: string;
  requestId: string;
  createdAt: string;
  counts: ClaimCodeBatchCounts;
};

class ClaimCodeBatchActionDto {
  @ApiProperty({ example: 'cm123action' })
  id!: string;

  @ApiProperty({ example: 'Credenciamento' })
  name!: string;
}

class ClaimCodeBatchCreatorDto {
  @ApiProperty({ example: 'cm123admin' })
  id!: string;

  @ApiProperty({ example: 'Admin Semcomp' })
  name!: string;

  @ApiProperty({ example: 'admin@example.com' })
  email!: string;
}

export class ClaimCodeBatchCountsDto implements ClaimCodeBatchCounts {
  @ApiProperty({ example: 10 })
  available!: number;

  @ApiProperty({ example: 2 })
  disabled!: number;

  @ApiProperty({ example: 1 })
  used!: number;

  @ApiProperty({ example: 0 })
  blocked!: number;
}

export class ClaimCodeBatchResponseDto implements ClaimCodeBatchSummary {
  @ApiProperty({ example: '4d3b7dd1-2b0d-42f4-b7ea-3f5d7b3e8c31' })
  id!: string;

  @ApiProperty({ type: ClaimCodeBatchActionDto })
  action!: ClaimCodeBatchActionDto;

  @ApiProperty({ type: ClaimCodeBatchCreatorDto })
  createdBy!: ClaimCodeBatchCreatorDto;

  @ApiProperty({ example: 100 })
  requestedQuantity!: number;

  @ApiProperty({ example: 100 })
  createdQuantity!: number;

  @ApiProperty({ example: 'Geracao administrativa do lote' })
  reason!: string;

  @ApiProperty({ example: 'request-123' })
  requestId!: string;

  @ApiProperty({ example: '2026-08-22T09:00:00-03:00' })
  createdAt!: string;

  @ApiProperty({ type: ClaimCodeBatchCountsDto })
  counts!: ClaimCodeBatchCountsDto;
}

export class ClaimCodeBatchesPageResponseDto {
  @ApiProperty({ type: [ClaimCodeBatchResponseDto] })
  items!: ClaimCodeBatchResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
