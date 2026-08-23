import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  Optional,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  ApiBody,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CsrfGuard } from '../auth/csrf.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { HttpErrorResponseDto } from '../common/dto/http-error-response.dto';
import { DownloadCapacityError } from '../common/download-gate';
import { sanitizeQrFileName } from '../claim-codes/claim-code-qr';
import { ClaimCodeArtifactsService } from '../claim-codes/claim-code-artifacts.service';
import type { Response } from 'express';
import { ActionsService } from './actions.service';
import {
  ActionResponseDto,
  toActionResponseDto,
} from './dto/action-response.dto';
import { AdminActionsQueryDto } from './dto/admin-actions-query.dto';
import { CreateActionDto } from './dto/create-action.dto';
import {
  AdminActionsPageResponseDto,
  ReusableCodeRedemptionsPageResponseDto,
  ReusableCodesPageResponseDto,
} from './dto/reusable-code-history-response.dto';
import {
  ReusableCodeRedemptionsQueryDto,
  ReusableCodesQueryDto,
} from './dto/reusable-codes-query.dto';
import { UpdateActionDto } from './dto/update-action.dto';
import { getAdminOperationContext } from '../common/request-context';
import type { AuthenticatedRequest } from '../common/request-context';

@ApiTags('Admin Actions')
@ApiSecurity('access-token-cookie')
@Controller()
@UseGuards(JwtAuthGuard, CsrfGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiUnauthorizedResponse({ type: HttpErrorResponseDto })
@ApiForbiddenResponse({ type: HttpErrorResponseDto })
export class AdminActionsController {
  constructor(
    private readonly actions: ActionsService,
    @Optional() private readonly artifacts?: ClaimCodeArtifactsService,
  ) {}

  @Post('actions')
  @ApiOperation({ summary: 'Criar uma atividade pontuável (admin)' })
  @ApiHeader({
    name: 'X-CSRF-Token',
    description: 'Token CSRF retornado no login ou em GET /auth/csrf.',
  })
  @ApiBody({ type: CreateActionDto })
  @ApiCreatedResponse({ type: ActionResponseDto })
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
    description: 'Acesso permitido apenas para admins.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 403,
      message: 'Você não tem permissão para acessar este recurso.',
      error: 'Forbidden',
    },
  })
  async create(
    @Body() dto: CreateActionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return toActionResponseDto(
      await this.actions.create(dto, getAdminOperationContext(request)),
    );
  }

  @Get('actions')
  @ApiOperation({ summary: 'Listar atividades pontuáveis (admin)' })
  @ApiOkResponse({ type: ActionResponseDto, isArray: true })
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
    description: 'Acesso permitido apenas para admins.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 403,
      message: 'Você não tem permissão para acessar este recurso.',
      error: 'Forbidden',
    },
  })
  async findLegacyActions() {
    return (await this.actions.findAll()).map(toActionResponseDto);
  }

  @Get('actions/:id')
  @ApiOperation({ summary: 'Buscar atividade por id (admin)' })
  @ApiOkResponse({ type: ActionResponseDto })
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
    description: 'Acesso permitido apenas para admins.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 403,
      message: 'Você não tem permissão para acessar este recurso.',
      error: 'Forbidden',
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
  async findLegacyActionById(@Param('id') id: string) {
    const action = await this.actions.findById(id);
    if (!action) {
      throw new NotFoundException('Atividade pontuável não encontrada.');
    }
    return toActionResponseDto(action);
  }

  @Get('admin/actions')
  @ApiOkResponse({ type: AdminActionsPageResponseDto })
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  findAll(@Query() query: AdminActionsQueryDto) {
    return this.actions.findAdminActions(query);
  }

  @Patch('admin/actions/:id')
  @ApiOkResponse({ type: ActionResponseDto })
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  @ApiConflictResponse({ type: HttpErrorResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateActionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.actions.update(id, dto, getAdminOperationContext(request));
  }

  @Get('admin/reusable-codes')
  @ApiOkResponse({ type: ReusableCodesPageResponseDto })
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  findReusableCodes(@Query() query: ReusableCodesQueryDto) {
    return this.actions.findReusableCodes(query);
  }

  @Get('admin/reusable-codes/:actionId/redemptions')
  @ApiOkResponse({ type: ReusableCodeRedemptionsPageResponseDto })
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  findReusableCodeRedemptions(
    @Param('actionId') actionId: string,
    @Query() query: ReusableCodeRedemptionsQueryDto,
  ) {
    return this.actions.findReusableCodeRedemptions(actionId, query);
  }

  @Get('admin/reusable-codes/:actionId/qr.png')
  @ApiOperation({ summary: 'Baixar PNG QR de um código reutilizável (admin)' })
  @ApiProduces('image/png')
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  async downloadReusableCodeQrPng(
    @Param('actionId') actionId: string,
    @Res() response: Response,
  ) {
    const artifact = await this.actions.getReusableCodeQrArtifact(actionId);
    try {
      await this.requireArtifacts().writeQrPng(
        response,
        artifact.cards[0],
        () => {
          this.setDownloadHeaders(
            response,
            'image/png',
            `codigo-reutilizavel-${sanitizeQrFileName(actionId)}-qr.png`,
          );
        },
      );
    } catch (error) {
      this.rethrowDownloadCapacity(response, error);
    }
  }

  @Get('admin/reusable-codes/:actionId/qr.pdf')
  @ApiOperation({ summary: 'Baixar PDF QR de um código reutilizável (admin)' })
  @ApiProduces('application/pdf')
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  async downloadReusableCodeQrPdf(
    @Param('actionId') actionId: string,
    @Res() response: Response,
  ) {
    const artifact = await this.actions.getReusableCodeQrArtifact(actionId);
    try {
      await this.requireArtifacts().writeQrPdf(
        response,
        artifact.cards,
        artifact.metadata,
        () => {
          this.setDownloadHeaders(
            response,
            'application/pdf',
            `codigo-reutilizavel-${sanitizeQrFileName(actionId)}-qr.pdf`,
          );
        },
      );
    } catch (error) {
      this.rethrowDownloadCapacity(response, error);
    }
  }

  private requireArtifacts() {
    if (!this.artifacts) {
      throw new Error('O gerador de artefatos QR não foi configurado.');
    }
    return this.artifacts;
  }

  private setDownloadHeaders(
    response: Response,
    contentType: string,
    filename: string,
  ) {
    response.setHeader('Content-Type', contentType);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
  }

  private rethrowDownloadCapacity(response: Response, error: unknown): never {
    if (error instanceof DownloadCapacityError) {
      response.setHeader('Retry-After', String(error.retryAfterSeconds));
    }
    throw error;
  }
}
