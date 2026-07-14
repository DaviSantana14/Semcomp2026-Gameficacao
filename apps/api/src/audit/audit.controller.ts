import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CsrfGuard } from '../auth/csrf.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
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
@UseGuards(JwtAuthGuard, CsrfGuard, RolesGuard)
@Roles(UserRole.ADMIN)
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
