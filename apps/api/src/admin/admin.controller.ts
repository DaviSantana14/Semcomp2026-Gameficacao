import { UserRole } from '@prisma/client';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CsrfGuard } from '../auth/csrf.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminParticipantsService } from './admin-participants.service';
import { AdminPointEventsPageResponseDto } from './dto/admin-point-event-response.dto';
import { AdminPointEventsQueryDto } from './dto/admin-point-events-query.dto';
import { AdminParticipantEventsQueryDto } from './dto/admin-participant-events-query.dto';
import { AdminParticipantRedemptionsQueryDto } from './dto/admin-participant-redemptions-query.dto';
import { AdminParticipantsQueryDto } from './dto/admin-participants-query.dto';
import { UpdateParticipantStatusDto } from './dto/update-participant-status.dto';
import { getAdminOperationContext } from '../common/request-context';
import type { AuthenticatedRequest } from '../common/request-context';

@ApiTags('Admin')
@ApiSecurity('access-token-cookie')
@Controller('admin')
@UseGuards(JwtAuthGuard, CsrfGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(
    private readonly dashboard: AdminDashboardService,
    private readonly participants: AdminParticipantsService,
  ) {}
  @Get('dashboard') getDashboard() {
    return this.dashboard.getOverview();
  }
  @Get('participants') findAll(@Query() query: AdminParticipantsQueryDto) {
    return this.participants.findAll(query);
  }
  @Get('point-events')
  @ApiOkResponse({ type: AdminPointEventsPageResponseDto })
  findGlobalPointEvents(@Query() query: AdminPointEventsQueryDto) {
    return this.participants.findGlobalPointEvents(query);
  }
  @Get('participants/:id') findOne(@Param('id') id: string) {
    return this.participants.findOne(id);
  }
  @Get('participants/:id/point-events') findPointEvents(
    @Param('id') id: string,
    @Query() query: AdminParticipantEventsQueryDto,
  ) {
    return this.participants.findPointEvents(id, query);
  }
  @Get('participants/:id/reward-redemptions') findRewardRedemptions(
    @Param('id') id: string,
    @Query() query: AdminParticipantRedemptionsQueryDto,
  ) {
    return this.participants.findRewardRedemptions(id, query);
  }
  @Patch('participants/:id/status') updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateParticipantStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.participants.updateStatus(
      id,
      dto,
      getAdminOperationContext(request),
    );
  }
}
