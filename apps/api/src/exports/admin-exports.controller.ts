import { UserRole } from '@prisma/client';
import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiProduces,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CsrfGuard } from '../auth/csrf.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { DownloadCapacityError } from '../common/download-gate';
import { HttpErrorResponseDto } from '../common/dto/http-error-response.dto';
import { AdminParticipantsQueryDto } from '../admin/dto/admin-participants-query.dto';
import { AdminRedemptionsQueryDto } from '../rewards/dto/admin-redemptions-query.dto';
import { AdminPointEventsQueryDto } from '../admin/dto/admin-point-events-query.dto';
import { CodeRedemptionsQueryDto } from '../claim-codes/dto/code-redemptions-query.dto';
import { AdminExportsService } from './admin-exports.service';

@ApiTags('Admin Exports')
@ApiSecurity('access-token-cookie')
@Controller('admin')
@UseGuards(JwtAuthGuard, CsrfGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminExportsController {
  constructor(private readonly exports: AdminExportsService) {}

  @Get('participants/export-count')
  @ApiOkResponse()
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  countParticipants(@Query() query: AdminParticipantsQueryDto) {
    return this.exports.countParticipants(query);
  }

  @Get('participants/export.csv')
  @ApiProduces('text/csv')
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  async exportParticipants(
    @Query() query: AdminParticipantsQueryDto,
    @Res() response: Response,
  ) {
    try {
      const csv = await this.exports.exportParticipants(query);
      setCsvHeaders(response, 'participantes.csv');
      response.send(csv);
    } catch (error) {
      setRetryAfterHeader(response, error);
      throw error;
    }
  }

  @Get('redemptions/export-count')
  @ApiOkResponse()
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  countRedemptions(@Query() query: AdminRedemptionsQueryDto) {
    return this.exports.countRedemptions(query);
  }

  @Get('redemptions/export.csv')
  @ApiProduces('text/csv')
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  async exportRedemptions(
    @Query() query: AdminRedemptionsQueryDto,
    @Res() response: Response,
  ) {
    try {
      const csv = await this.exports.exportRedemptions(query);
      setCsvHeaders(response, 'pedidos-lojinha.csv');
      response.send(csv);
    } catch (error) {
      setRetryAfterHeader(response, error);
      throw error;
    }
  }

  @Get('point-events/export-count')
  @ApiOkResponse()
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  countPointEvents(@Query() query: AdminPointEventsQueryDto) {
    return this.exports.countPointEvents(query);
  }

  @Get('point-events/export.csv')
  @ApiProduces('text/csv')
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  async exportPointEvents(
    @Query() query: AdminPointEventsQueryDto,
    @Res() response: Response,
  ) {
    try {
      const csv = await this.exports.exportPointEvents(query);
      setCsvHeaders(response, 'movimentacoes.csv');
      response.send(csv);
    } catch (error) {
      setRetryAfterHeader(response, error);
      throw error;
    }
  }

  @Get('code-redemptions/export-count')
  @ApiOkResponse()
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  countCodeRedemptions(@Query() query: CodeRedemptionsQueryDto) {
    return this.exports.countCodeRedemptions(query);
  }

  @Get('code-redemptions/export.csv')
  @ApiProduces('text/csv')
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  async exportCodeRedemptions(
    @Query() query: CodeRedemptionsQueryDto,
    @Res() response: Response,
  ) {
    try {
      const csv = await this.exports.exportCodeRedemptions(query);
      setCsvHeaders(response, 'resgates-codigos.csv');
      response.send(csv);
    } catch (error) {
      setRetryAfterHeader(response, error);
      throw error;
    }
  }
}

function setCsvHeaders(response: Response, filename: string) {
  response.setHeader('Content-Type', 'text/csv; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}"`,
  );
}

function setRetryAfterHeader(response: Response, error: unknown) {
  if (error instanceof DownloadCapacityError) {
    response.setHeader('Retry-After', String(error.retryAfterSeconds));
  }
}
