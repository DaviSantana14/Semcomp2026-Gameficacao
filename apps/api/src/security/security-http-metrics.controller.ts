import { AdminProfile } from '@prisma/client';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CsrfGuard } from '../auth/csrf.guard';
import { AdminProfiles } from '../auth/admin-profiles.decorator';
import { AdminProfilesGuard } from '../auth/admin-profiles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SecurityHttpMetricsService } from './security-http-metrics.service';
import { SecurityHttpMetricsResponseDto } from './dto/security-http-metrics-response.dto';

@ApiTags('Security Metrics')
@ApiSecurity('access-token-cookie')
@Controller('admin/security-metrics')
@UseGuards(JwtAuthGuard, CsrfGuard, AdminProfilesGuard)
@AdminProfiles(AdminProfile.GENERAL)
export class SecurityHttpMetricsController {
  constructor(private readonly metrics: SecurityHttpMetricsService) {}

  @Get('overview')
  @ApiOkResponse({ type: SecurityHttpMetricsResponseDto })
  overview() {
    return this.metrics.getOverview(new Date());
  }
}
