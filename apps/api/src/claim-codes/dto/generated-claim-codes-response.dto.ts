import { ApiProperty } from '@nestjs/swagger';
import { ClaimCodeBatchResponseDto } from './claim-code-batch-response.dto';

class GeneratedClaimCodesActionDto {
  @ApiProperty({ example: 'cm123action' })
  id: string;

  @ApiProperty({ example: 'Credenciamento' })
  name: string;
}

export class GeneratedClaimCodesResponseDto {
  @ApiProperty({ type: ClaimCodeBatchResponseDto })
  batch: ClaimCodeBatchResponseDto;

  @ApiProperty({ type: GeneratedClaimCodesActionDto })
  action: GeneratedClaimCodesActionDto;

  @ApiProperty({ example: 2 })
  quantity: number;

  @ApiProperty({
    type: [String],
    example: ['AAAA-AAAA', 'BBBB-BBBB'],
  })
  codes: string[];
}
