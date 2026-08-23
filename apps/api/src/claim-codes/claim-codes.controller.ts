import { AdminProfile } from '@prisma/client';
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
  Optional,
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
import { AdminProfiles } from '../auth/admin-profiles.decorator';
import { AdminProfilesGuard } from '../auth/admin-profiles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HttpErrorResponseDto } from '../common/dto/http-error-response.dto';
import {
  getAdminOperationContext,
  type AuthenticatedRequest,
} from '../common/request-context';
import { DownloadCapacityError } from '../common/download-gate';
import { sanitizeQrFileName } from './claim-code-qr';
import { ClaimCodeArtifactsService } from './claim-code-artifacts.service';
import { ClaimCodesService } from './claim-codes.service';
import { serializeClaimCodeBatchText } from './claim-code-batch-text';
import { ClaimCodeBatchesQueryDto } from './dto/claim-code-batches-query.dto';
import { BulkClaimCodeStatusDto } from './dto/bulk-claim-code-status.dto';
import { ClaimCodeBulkQueryDto } from './dto/claim-code-bulk-query.dto';
import {
  ClaimCodeBulkOperationResponseDto,
  ClaimCodeBulkOperationsPageResponseDto,
} from './dto/claim-code-bulk-response.dto';
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
import { serializeClaimCodeBulkCsv } from './claim-code-bulk-csv';
import { CodeRedemptionsPageResponseDto } from './dto/code-redemption-response.dto';
import { CodeRedemptionsQueryDto } from './dto/code-redemptions-query.dto';
import { RateLimitPolicy } from '../security/rate-limit-policy.decorator';

@ApiTags('Claim Codes')
@ApiSecurity('access-token-cookie')
@Controller('admin')
@UseGuards(JwtAuthGuard, CsrfGuard, AdminProfilesGuard)
@AdminProfiles(AdminProfile.GENERAL, AdminProfile.ACTIVITIES)
export class ClaimCodesController {
  constructor(
    private readonly claimCodesService: ClaimCodesService,
    @Optional() private readonly artifacts?: ClaimCodeArtifactsService,
  ) {}

  @Get('claim-codes')
  @ApiOperation({ summary: 'Listar histórico de códigos de uso único (admin)' })
  @ApiOkResponse({ type: ClaimCodesPageResponseDto })
  findAll(@Query() query: ClaimCodesQueryDto) {
    return this.claimCodesService.findAll(query);
  }

  @Get('code-redemptions')
  @ApiOperation({ summary: 'Listar resgates por código (admin)' })
  @ApiOkResponse({ type: CodeRedemptionsPageResponseDto })
  findCodeRedemptions(@Query() query: CodeRedemptionsQueryDto) {
    return this.claimCodesService.findCodeRedemptions(query);
  }

  @Get('claim-code-batches')
  @ApiOperation({ summary: 'Listar lotes de códigos de uso único (admin)' })
  @ApiOkResponse({ type: ClaimCodeBatchesPageResponseDto })
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  findBatches(@Query() query: ClaimCodeBatchesQueryDto) {
    return this.claimCodesService.findBatches(query);
  }

  @Get('claim-code-batches/:id')
  @ApiOperation({ summary: 'Consultar lote de códigos de uso único (admin)' })
  @ApiOkResponse({ type: ClaimCodeBatchResponseDto })
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  findBatch(@Param('id') id: string) {
    return this.claimCodesService.findBatch(id);
  }

  @Post('claim-codes/bulk-status')
  @RateLimitPolicy('bulk')
  @ApiOperation({ summary: 'Alterar status de códigos em lote (admin)' })
  @ApiBody({ type: BulkClaimCodeStatusDto })
  @ApiCreatedResponse({ type: ClaimCodeBulkOperationResponseDto })
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  @ApiConflictResponse({ type: HttpErrorResponseDto })
  bulkUpdateStatus(
    @Body() dto: BulkClaimCodeStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.claimCodesService.bulkUpdateStatus(
      dto,
      getAdminOperationContext(request),
    );
  }

  @Get('claim-code-bulk-operations')
  @ApiOperation({ summary: 'Listar operações de status em lote (admin)' })
  @ApiOkResponse({ type: ClaimCodeBulkOperationsPageResponseDto })
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  findBulkOperations(@Query() query: ClaimCodeBulkQueryDto) {
    return this.claimCodesService.findBulkOperations(query);
  }

  @Get('claim-code-bulk-operations/:id')
  @ApiOperation({ summary: 'Consultar operação de status em lote (admin)' })
  @ApiOkResponse({ type: ClaimCodeBulkOperationResponseDto })
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  findBulkOperation(@Param('id') id: string) {
    return this.claimCodesService.findBulkOperation(id);
  }

  @Get('claim-code-bulk-operations/:id/report.csv')
  @RateLimitPolicy('export')
  @ApiOperation({ summary: 'Baixar relatório de operação em lote (admin)' })
  @ApiProduces('text/csv')
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  @Header('Cache-Control', 'no-store')
  async downloadBulkReport(@Param('id') id: string, @Res() response: Response) {
    const items = await this.claimCodesService.getBulkReport(id);
    const safeId = id.replace(/[^A-Za-z0-9_-]/g, '_');
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="codigos-bulk-${safeId}.csv"`,
    );
    response.send(serializeClaimCodeBulkCsv(items));
  }

  @Get('claim-code-batches/:id/download.txt')
  @RateLimitPolicy('export')
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

  @Get('claim-code-batches/:id/qr.pdf')
  @RateLimitPolicy('export')
  @ApiOperation({ summary: 'Baixar PDF QR de um lote (admin)' })
  @ApiProduces('application/pdf')
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  async downloadBatchQrPdf(@Param('id') id: string, @Res() response: Response) {
    const artifact = await this.claimCodesService.getBatchQrArtifact(id);
    try {
      await this.requireArtifacts().writeQrPdf(
        response,
        artifact.cards,
        artifact.metadata,
        () => {
          this.setDownloadHeaders(
            response,
            'application/pdf',
            `codigos-${sanitizeQrFileName(id)}-qr.pdf`,
          );
        },
      );
    } catch (error) {
      this.rethrowDownloadCapacity(response, error);
    }
  }

  @Get('claim-code-batches/:id/qr-images.zip')
  @RateLimitPolicy('export')
  @ApiOperation({ summary: 'Baixar ZIP de imagens QR de um lote (admin)' })
  @ApiProduces('application/zip')
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  async downloadBatchQrZip(@Param('id') id: string, @Res() response: Response) {
    const artifact = await this.claimCodesService.getBatchQrArtifact(id);
    try {
      await this.requireArtifacts().writeQrZip(response, artifact.cards, () => {
        this.setDownloadHeaders(
          response,
          'application/zip',
          `codigos-${sanitizeQrFileName(id)}-qr-images.zip`,
        );
      });
    } catch (error) {
      this.rethrowDownloadCapacity(response, error);
    }
  }

  @Patch('claim-codes/:id/status')
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
