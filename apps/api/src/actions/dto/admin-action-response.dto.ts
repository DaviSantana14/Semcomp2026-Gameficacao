import { ApiProperty } from '@nestjs/swagger';
import { ActionResponseDto } from './action-response.dto';

export class AdminActionResponseDto extends ActionResponseDto {
  @ApiProperty({ example: 12 })
  claimCodesCount!: number;

  @ApiProperty({ example: 8 })
  redemptionsCount!: number;
}
