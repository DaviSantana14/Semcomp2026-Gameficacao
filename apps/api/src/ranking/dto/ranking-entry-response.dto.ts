import { ApiProperty } from '@nestjs/swagger';

export class RankingEntryResponseDto {
  @ApiProperty({ example: 1 })
  position: number;

  @ApiProperty({ example: 'Ada Lovelace' })
  name: string;

  @ApiProperty({ example: 120 })
  xp: number;
}
