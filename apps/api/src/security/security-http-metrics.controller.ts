import { UserRole } from '@prisma/client';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CsrfGuard } from '../auth/csrf.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SecurityHttpMetricsService } from './security-http-metrics.service';
import { SecurityHttpMetricsResponseDto } from './dto/security-http-metrics-response.dto';

@ApiTags('Security Metrics')
@ApiSecurity('access-token-cookie')
@Controller('admin/security-metrics')
@UseGuards(JwtAuthGuard, CsrfGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class SecurityHttpMetricsController {
  constructor(private readonly metrics: SecurityHttpMetricsService) {}

  @Get('overview')
  @ApiOkResponse({ type: SecurityHttpMetricsResponseDto })
  overview() {
    return this.metrics.getOverview(new Date());
  }
}
