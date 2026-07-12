import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CsrfGuard } from '../auth/csrf.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { HttpErrorResponseDto } from '../common/dto/http-error-response.dto';
import { AdminRedemptionsPageResponseDto } from './dto/admin-redemption-list-response.dto';
import { AdminRedemptionsQueryDto } from './dto/admin-redemptions-query.dto';
import { AdminRewardsPageResponseDto } from './dto/admin-reward-response.dto';
import { AdminRewardsQueryDto } from './dto/admin-rewards-query.dto';
import { RewardsService } from './rewards.service';

@ApiTags('Admin Rewards')
@ApiSecurity('access-token-cookie')
@Controller('admin')
@UseGuards(JwtAuthGuard, CsrfGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiUnauthorizedResponse({ type: HttpErrorResponseDto })
@ApiForbiddenResponse({ type: HttpErrorResponseDto })
export class AdminRewardsController {
  constructor(private readonly rewards: RewardsService) {}

  @Get('rewards')
  @ApiOkResponse({ type: AdminRewardsPageResponseDto })
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  findRewards(@Query() query: AdminRewardsQueryDto) {
    return this.rewards.findAdminRewards(query);
  }

  @Get('redemptions')
  @ApiOkResponse({ type: AdminRedemptionsPageResponseDto })
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  findRedemptions(@Query() query: AdminRedemptionsQueryDto) {
    return this.rewards.findRedemptions(query);
  }
}
