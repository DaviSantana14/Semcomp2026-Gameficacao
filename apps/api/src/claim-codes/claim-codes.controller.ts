import { UserRole } from '@prisma/client';
import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiConflictResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOperation,
  ApiProduces,
  ApiSecurity,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CsrfGuard } from '../auth/csrf.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { HttpErrorResponseDto } from '../common/dto/http-error-response.dto';
import {
  getAdminOperationContext,
  type AuthenticatedRequest,
} from '../common/request-context';
import { ClaimCodesService } from './claim-codes.service';
import { serializeClaimCodeBatchText } from './claim-code-batch-text';
import { ClaimCodeBatchesQueryDto } from './dto/claim-code-batches-query.dto';
import {
  ClaimCodeBatchResponseDto,
  ClaimCodeBatchesPageResponseDto,
} from './dto/claim-code-batch-response.dto';
import { GenerateClaimCodesDto } from './dto/generate-claim-codes.dto';
import { GeneratedClaimCodesResponseDto } from './dto/generated-claim-codes-response.dto';
import { ClaimCodesQueryDto } from './dto/claim-codes-query.dto';
import {
  ClaimCodeHistoryResponseDto,
  ClaimCodesPageResponseDto,
} from './dto/claim-code-history-response.dto';
import { UpdateClaimCodeStatusDto } from './dto/update-claim-code-status.dto';

@ApiTags('Claim Codes')
@ApiSecurity('access-token-cookie')
@Controller('admin')
@UseGuards(JwtAuthGuard, CsrfGuard, RolesGuard)
export class ClaimCodesController {
  constructor(private readonly claimCodesService: ClaimCodesService) {}

  @Get('claim-codes')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar histórico de códigos de uso único (admin)' })
  @ApiOkResponse({ type: ClaimCodesPageResponseDto })
  findAll(@Query() query: ClaimCodesQueryDto) {
    return this.claimCodesService.findAll(query);
  }

  @Get('claim-code-batches')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar lotes de códigos de uso único (admin)' })
  @ApiOkResponse({ type: ClaimCodeBatchesPageResponseDto })
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  findBatches(@Query() query: ClaimCodeBatchesQueryDto) {
    return this.claimCodesService.findBatches(query);
  }

  @Get('claim-code-batches/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Consultar lote de códigos de uso único (admin)' })
  @ApiOkResponse({ type: ClaimCodeBatchResponseDto })
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  findBatch(@Param('id') id: string) {
    return this.claimCodesService.findBatch(id);
  }

  @Get('claim-code-batches/:id/download.txt')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Baixar códigos persistidos de um lote (admin)' })
  @ApiProduces('text/plain')
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  @Header('Cache-Control', 'no-store')
  async downloadBatchText(@Param('id') id: string, @Res() response: Response) {
    const codes = await this.claimCodesService.getBatchCodes(id);
    const safeBatchId = id.replace(/[^A-Za-z0-9_-]/g, '_');
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="codigos-${safeBatchId}.txt"`,
    );
    response.send(serializeClaimCodeBatchText(codes));
  }

  @Patch('claim-codes/:id/status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Ativar ou desativar código de uso único (admin)' })
  @ApiOkResponse({ type: ClaimCodeHistoryResponseDto })
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  @ApiConflictResponse({ type: HttpErrorResponseDto })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateClaimCodeStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.claimCodesService.updateStatus(
      id,
      dto,
      getAdminOperationContext(request),
    );
  }

  @Post('actions/:id/claim-codes/generate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Gerar lote de códigos de uso único (admin)' })
  @ApiHeader({
    name: 'X-CSRF-Token',
    description: 'Token CSRF retornado no login ou em GET /auth/csrf.',
  })
  @ApiBody({ type: GenerateClaimCodesDto })
  @ApiCreatedResponse({ type: GeneratedClaimCodesResponseDto })
  @ApiUnauthorizedResponse({ type: HttpErrorResponseDto })
  @ApiForbiddenResponse({ type: HttpErrorResponseDto })
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  @ApiServiceUnavailableResponse({ type: HttpErrorResponseDto })
  generate(
    @Param('id') id: string,
    @Body() dto: GenerateClaimCodesDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.claimCodesService.generateBatch(
      id,
      dto,
      getAdminOperationContext(request),
    );
  }
}
