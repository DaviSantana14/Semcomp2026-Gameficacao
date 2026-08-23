import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AdminProfile } from '@prisma/client';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CsrfGuard } from '../auth/csrf.guard';
import { AdminProfiles } from '../auth/admin-profiles.decorator';
import { AdminProfilesGuard } from '../auth/admin-profiles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HttpErrorResponseDto } from '../common/dto/http-error-response.dto';
import { AuditService } from './audit.service';
import { AuditEventPageResponseDto } from './dto/audit-event-response.dto';
import {
  ListAuditEventsDto,
  ListParticipantAuditEventsDto,
} from './dto/list-audit-events.dto';

@ApiTags('Admin Audit')
@ApiSecurity('access-token-cookie')
@Controller('admin')
@UseGuards(JwtAuthGuard, CsrfGuard, AdminProfilesGuard)
@AdminProfiles(AdminProfile.GENERAL)
@ApiUnauthorizedResponse({ type: HttpErrorResponseDto })
@ApiForbiddenResponse({ type: HttpErrorResponseDto })
export class AuditController {
  constructor(private readonly service: AuditService) {}

  @Get('audit-events')
  @ApiOkResponse({ type: AuditEventPageResponseDto })
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  findAll(@Query() query: ListAuditEventsDto) {
    return this.service.listGlobal(query);
  }

  @Get('participants/:id/audit-events')
  @ApiOkResponse({ type: AuditEventPageResponseDto })
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  findParticipant(
    @Param('id') id: string,
    @Query() query: ListParticipantAuditEventsDto,
  ) {
    return this.service.listParticipant(id, query);
  }
}
