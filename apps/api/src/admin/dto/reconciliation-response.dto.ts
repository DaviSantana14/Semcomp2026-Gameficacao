import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ReconciliationStatus {
  CONSISTENT = 'CONSISTENT',
  DIVERGENT = 'DIVERGENT',
}

export class ReconciliationResponseDto {
  @ApiProperty()
  participantId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  storedPoints!: number;

  @ApiProperty()
  ledgerPoints!: number;

  @ApiProperty()
  pointsDifference!: number;

  @ApiProperty()
  storedXp!: number;

  @ApiProperty()
  ledgerXp!: number;

  @ApiProperty()
  xpDifference!: number;

  @ApiProperty({ enum: ReconciliationStatus })
  status!: ReconciliationStatus;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastEventAt!: string | null;
}

export class ReconciliationSummaryResponseDto {
  @ApiProperty()
  divergentParticipants!: number;
}
