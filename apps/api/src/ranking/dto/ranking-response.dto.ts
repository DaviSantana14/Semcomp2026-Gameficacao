import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RankingEntryResponseDto } from './ranking-entry-response.dto';

export class RankingResponseDto {
  @ApiProperty({ type: RankingEntryResponseDto, isArray: true })
  ranking: RankingEntryResponseDto[];

  @ApiPropertyOptional({
    type: RankingEntryResponseDto,
    nullable: true,
    description:
      'Posição do usuário autenticado quando ele participa do ranking. Admins retornam null.',
  })
  me: RankingEntryResponseDto | null;
}
