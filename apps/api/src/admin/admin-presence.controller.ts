import { UserRole } from '@prisma/client';
import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
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
import { HttpErrorResponseDto } from '../common/dto/http-error-response.dto';
import { PresenceService } from '../presence/presence.service';
import { serializePresenceCsv } from '../presence/presence-csv';
import {
  formatPresenceDate,
  parsePresenceRange,
  PresenceDateRangeDto,
} from './dto/presence-date-range.dto';
import {
  PresenceHistoryResponseDto,
  PresenceOverviewResponseDto,
} from './dto/presence-response.dto';

@ApiTags('Admin Presence')
@ApiSecurity('access-token-cookie')
@Controller('admin/presence')
@UseGuards(JwtAuthGuard, CsrfGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminPresenceController {
  constructor(private readonly presence: PresenceService) {}

  @Get('overview')
  @ApiOkResponse({ type: PresenceOverviewResponseDto })
  overview() {
    return this.presence.getOverview(new Date());
  }

  @Get('history')
  @ApiOkResponse({ type: PresenceHistoryResponseDto })
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  history(@Query() query: PresenceDateRangeDto) {
    return this.presence.getDailyHistory(parsePresenceRange(query, new Date()));
  }

  @Get('export.csv')
  @ApiProduces('text/csv')
  @Header('Cache-Control', 'no-store')
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  async exportCsv(
    @Query() query: PresenceDateRangeDto,
    @Res() response: Response,
  ) {
    const range = parsePresenceRange(query, new Date());
    const { general, daily } = await this.presence.getExportData(range);
    const csv = serializePresenceCsv(general, daily);
    const from = formatPresenceDate(range.from);
    const to = formatPresenceDate(range.to);

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="presenca-${from}-a-${to}.csv"`,
    );
    response.send(csv);
  }
}
