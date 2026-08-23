import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AdminProfile } from '@prisma/client';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CsrfGuard } from '../auth/csrf.guard';
import { AdminProfiles } from '../auth/admin-profiles.decorator';
import { AdminProfilesGuard } from '../auth/admin-profiles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { getAdminOperationContext } from '../common/request-context';
import type { AuthenticatedRequest } from '../common/request-context';
import { HttpErrorResponseDto } from '../common/dto/http-error-response.dto';
import { AdminAdjustmentsService } from './admin-adjustments.service';
import { CreateParticipantAdjustmentDto } from './dto/create-participant-adjustment.dto';
import { ReversePointEventDto } from './dto/reverse-point-event.dto';

@ApiTags('Admin Adjustments')
@ApiSecurity('access-token-cookie')
@Controller('admin')
@UseGuards(JwtAuthGuard, CsrfGuard, AdminProfilesGuard)
@AdminProfiles(AdminProfile.GENERAL)
@ApiUnauthorizedResponse({ type: HttpErrorResponseDto })
@ApiForbiddenResponse({ type: HttpErrorResponseDto })
export class AdminAdjustmentsController {
  constructor(private readonly service: AdminAdjustmentsService) {}

  @Post('participants/:id/adjustments')
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  @ApiConflictResponse({ type: HttpErrorResponseDto })
  adjust(
    @Param('id') id: string,
    @Body() dto: CreateParticipantAdjustmentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.adjust(id, dto, getAdminOperationContext(request));
  }

  @Post('point-events/:id/reverse')
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  @ApiConflictResponse({ type: HttpErrorResponseDto })
  reverse(
    @Param('id') id: string,
    @Body() dto: ReversePointEventDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.reverse(id, dto, getAdminOperationContext(request));
  }
}
