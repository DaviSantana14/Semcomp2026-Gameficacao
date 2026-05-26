import { ApiProperty } from '@nestjs/swagger';
import { ActionResponseDto } from './action-response.dto';

export class RedeemActionResponseDto {
  @ApiProperty({
    example: 'Atividade resgatada com sucesso.',
  })
  message: string;

  @ApiProperty({
    type: ActionResponseDto,
  })
  action: ActionResponseDto;

  @ApiProperty({
    example: 10,
  })
  awardedPoints: number;

  @ApiProperty({
    example: 120,
  })
  currentPoints: number;

  @ApiProperty({
    example: 120,
  })
  currentXp: number;

  @ApiProperty({
    example: 2,
  })
  currentLevel: number;

  @ApiProperty({
    example: '2026-05-04T17:05:20.115Z',
    type: String,
  })
  redeemedAt: Date;
}
