import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HttpErrorResponseDto } from '../common/dto/http-error-response.dto';
import { RankingResponseDto } from './dto/ranking-response.dto';
import { RankingService } from './ranking.service';

@ApiTags('Ranking')
@ApiSecurity('access-token-cookie')
@Controller('ranking')
@UseGuards(JwtAuthGuard)
export class RankingController {
  constructor(private readonly rankingService: RankingService) {}

  @Get()
  @ApiOperation({ summary: 'Listar ranking por XP' })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 10,
    description: 'Quantidade de participantes no topo. Valor entre 1 e 50.',
  })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['daily', 'weekly', 'all'],
    example: 'all',
    description:
      'Período do ranking. all usa XP acumulado; daily e weekly usam XP ganho no período.',
  })
  @ApiOkResponse({ type: RankingResponseDto })
  @ApiBadRequestResponse({
    description: 'Limit ou period inválido.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 400,
      message: 'limit deve ser um inteiro entre 1 e 50.',
      error: 'Bad Request',
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Token ausente, inválido ou usuário inativo.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 401,
      message: 'Autenticação necessária ou token inválido.',
      error: 'Unauthorized',
    },
  })
  getGeneralRanking(
    @Req() request: { user: { id: string } },
    @Query('limit') limit?: string,
    @Query('period') period?: string,
  ) {
    return this.rankingService.getRanking(request.user.id, { limit, period });
  }
}
