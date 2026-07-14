import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { CsrfGuard } from '../auth/csrf.guard';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { HttpErrorResponseDto } from '../common/dto/http-error-response.dto';
import { ActionsService } from './actions.service';
import { toActionResponseDto } from './dto/action-response.dto';
import { RedeemActionCodeDto } from './dto/redeem-action-code.dto';
import { RedeemActionResponseDto } from './dto/redeem-action-response.dto';

@ApiTags('Actions')
@ApiSecurity('access-token-cookie')
@Controller('actions')
@UseGuards(JwtAuthGuard, CsrfGuard, RolesGuard)
export class ActionsController {
  constructor(private readonly actionsService: ActionsService) {}

  @Post('redeem-code')
  @Roles(UserRole.PARTICIPANT)
  @ApiOperation({
    summary: 'Resgatar uma atividade por código reutilizável ou individual',
    description:
      'Aceita códigos reutilizáveis de atividades e códigos individuais de uso único.',
  })
  @ApiHeader({
    name: 'X-CSRF-Token',
    description: 'Token CSRF retornado no login ou em GET /auth/csrf.',
  })
  @ApiBody({ type: RedeemActionCodeDto })
  @ApiCreatedResponse({ type: RedeemActionResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Token ausente ou inválido.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 401,
      message: 'Autenticação necessária ou token inválido.',
      error: 'Unauthorized',
    },
  })
  @ApiForbiddenResponse({
    description: 'Resgate permitido apenas para participantes.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 403,
      message: 'Você não tem permissão para acessar este recurso.',
      error: 'Forbidden',
    },
  })
  @ApiBadRequestResponse({
    description: 'Atividade inativa.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 400,
      message: 'Esta atividade está inativa e não pode ser resgatada.',
      error: 'Bad Request',
    },
  })
  @ApiConflictResponse({
    description:
      'Código individual já utilizado ou atividade já resgatada pelo usuário.',
    type: HttpErrorResponseDto,
    examples: {
      claimCodeUsed: {
        summary: 'Código individual já utilizado',
        value: {
          statusCode: 409,
          message: 'Este código já foi utilizado.',
          error: 'Conflict',
        },
      },
      actionAlreadyRedeemed: {
        summary: 'Atividade já resgatada pelo usuário',
        value: {
          statusCode: 409,
          message: 'Você já resgatou esta atividade.',
          error: 'Conflict',
        },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Atividade não encontrada para o código informado.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 404,
      message: 'Atividade pontuável não encontrada.',
      error: 'Not Found',
    },
  })
  async redeemByCode(
    @Body() redeemActionCodeDto: RedeemActionCodeDto,
    @Req() request: { user: { id: string } },
  ) {
    const redeemed = await this.actionsService.redeemByCode(
      redeemActionCodeDto.code,
      request.user.id,
    );

    return {
      message: 'Atividade resgatada com sucesso.',
      ...redeemed,
      action: toActionResponseDto(redeemed.action),
    };
  }

  @Post(':id/redeem')
  @Roles(UserRole.PARTICIPANT)
  @ApiOperation({ summary: 'Resgatar uma atividade pontuável' })
  @ApiHeader({
    name: 'X-CSRF-Token',
    description: 'Token CSRF retornado no login ou em GET /auth/csrf.',
  })
  @ApiCreatedResponse({ type: RedeemActionResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Token ausente ou inválido.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 401,
      message: 'Autenticação necessária ou token inválido.',
      error: 'Unauthorized',
    },
  })
  @ApiBadRequestResponse({
    description: 'Atividade inativa.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 400,
      message: 'Esta atividade está inativa e não pode ser resgatada.',
      error: 'Bad Request',
    },
  })
  @ApiConflictResponse({
    description: 'Atividade já resgatada pelo usuário.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 409,
      message: 'Você já resgatou esta atividade.',
      error: 'Conflict',
    },
  })
  @ApiNotFoundResponse({
    description: 'Atividade não encontrada.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 404,
      message: 'Atividade pontuável não encontrada.',
      error: 'Not Found',
    },
  })
  @ApiForbiddenResponse({
    description: 'Resgate permitido apenas para participantes.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 403,
      message: 'Você não tem permissão para acessar este recurso.',
      error: 'Forbidden',
    },
  })
  async redeem(
    @Param('id') id: string,
    @Req() request: { user: { id: string } },
  ) {
    const redeemed = await this.actionsService.redeem(id, request.user.id);

    return {
      message: 'Atividade resgatada com sucesso.',
      ...redeemed,
      action: toActionResponseDto(redeemed.action),
    };
  }
}
