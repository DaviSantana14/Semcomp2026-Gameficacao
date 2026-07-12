import { ApiProperty } from '@nestjs/swagger';
import { ActionResponseDto } from './action-response.dto';

export class AdminActionResponseDto extends ActionResponseDto {
  @ApiProperty({ example: { total: 12, used: 8, available: 4 } })
  claimCodes!: { total: number; used: number; available: number };

  @ApiProperty({ example: 8 })
  redemptionsCount!: number;
}
