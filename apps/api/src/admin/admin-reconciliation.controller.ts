import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminProfile } from '@prisma/client';
import {
  ApiForbiddenResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
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
import { getAdminOperationContext } from '../common/request-context';
import type { AuthenticatedRequest } from '../common/request-context';
import { AdminReconciliationService } from './admin-reconciliation.service';
import { ListReconciliationDto } from './dto/list-reconciliation.dto';
import { ConfirmReconciliationDto } from './dto/confirm-reconciliation.dto';
import {
  ReconciliationResponseDto,
  ReconciliationSummaryResponseDto,
} from './dto/reconciliation-response.dto';

@ApiTags('Admin Reconciliation')
@ApiSecurity('access-token-cookie')
@Controller('admin')
@UseGuards(JwtAuthGuard, CsrfGuard, AdminProfilesGuard)
@AdminProfiles(AdminProfile.GENERAL)
@ApiUnauthorizedResponse({ type: HttpErrorResponseDto })
@ApiForbiddenResponse({ type: HttpErrorResponseDto })
export class AdminReconciliationController {
  constructor(private readonly service: AdminReconciliationService) {}

  @Get('reconciliation/summary')
  @ApiOkResponse({ type: ReconciliationSummaryResponseDto })
  summary() {
    return this.service.getSummary();
  }

  @Get('reconciliation')
  findAll(@Query() query: ListReconciliationDto) {
    return this.service.findAll(query);
  }

  @Get('participants/:id/reconciliation')
  @ApiOkResponse({ type: ReconciliationResponseDto })
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post('participants/:id/reconciliation/confirm')
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  @ApiConflictResponse({ type: HttpErrorResponseDto })
  confirm(
    @Param('id') id: string,
    @Body() dto: ConfirmReconciliationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.confirm(id, dto, getAdminOperationContext(request));
  }
}
