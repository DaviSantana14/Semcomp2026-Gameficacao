import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
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
import { CreateRewardDto } from './dto/create-reward.dto';
import {
  RewardRedemptionResponseDto,
  toRewardRedemptionResponseDto,
} from './dto/reward-redemption-response.dto';
import {
  RewardResponseDto,
  toRewardResponseDto,
} from './dto/reward-response.dto';
import { UpdateRewardDto } from './dto/update-reward.dto';
import { RewardsService } from './rewards.service';
import { RedemptionTransitionDto } from './dto/redemption-transition.dto';
import { getAdminOperationContext } from '../common/request-context';
import type { AuthenticatedRequest } from '../common/request-context';

@ApiTags('Admin Rewards')
@ApiSecurity('access-token-cookie')
@Controller()
@UseGuards(JwtAuthGuard, CsrfGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiUnauthorizedResponse({ type: HttpErrorResponseDto })
@ApiForbiddenResponse({ type: HttpErrorResponseDto })
export class AdminRewardsController {
  constructor(private readonly rewards: RewardsService) {}

  @Post('rewards')
  @ApiOperation({ summary: 'Criar recompensa da lojinha (admin)' })
  @ApiHeader({
    name: 'X-CSRF-Token',
    description: 'Token CSRF retornado no login ou em GET /auth/csrf.',
  })
  @ApiBody({ type: CreateRewardDto })
  @ApiCreatedResponse({ type: RewardResponseDto })
  async create(
    @Body() dto: CreateRewardDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return toRewardResponseDto(
      await this.rewards.create(dto, getAdminOperationContext(request)),
    );
  }

  @Patch('rewards/:id')
  @ApiOperation({ summary: 'Editar recompensa da lojinha (admin)' })
  @ApiHeader({
    name: 'X-CSRF-Token',
    description: 'Token CSRF retornado no login ou em GET /auth/csrf.',
  })
  @ApiBody({ type: UpdateRewardDto })
  @ApiOkResponse({ type: RewardResponseDto })
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRewardDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return toRewardResponseDto(
      await this.rewards.update(id, dto, getAdminOperationContext(request)),
    );
  }

  @Get('admin/redemptions/pending')
  @ApiOperation({ summary: 'Listar resgates pendentes da lojinha (admin)' })
  @ApiOkResponse({ type: RewardRedemptionResponseDto, isArray: true })
  async findPendingRedemptions() {
    return (await this.rewards.findPendingRedemptions()).map(
      toRewardRedemptionResponseDto,
    );
  }

  @Patch('admin/redemptions/:id/deliver')
  @ApiOperation({ summary: 'Marcar resgate como entregue (admin)' })
  @ApiHeader({
    name: 'X-CSRF-Token',
    description: 'Token CSRF retornado no login ou em GET /auth/csrf.',
  })
  @ApiOkResponse({ type: RewardRedemptionResponseDto })
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  @ApiConflictResponse({ type: HttpErrorResponseDto })
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  async deliverRedemption(
    @Param('id') id: string,
    @Body() dto: RedemptionTransitionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return toRewardRedemptionResponseDto(
      await this.rewards.deliverRedemption(
        id,
        dto,
        getAdminOperationContext(request),
      ),
    );
  }

  @Patch('admin/redemptions/:id/cancel')
  @ApiOperation({ summary: 'Cancelar resgate pendente (admin)' })
  @ApiHeader({
    name: 'X-CSRF-Token',
    description: 'Token CSRF retornado no login ou em GET /auth/csrf.',
  })
  @ApiOkResponse({ type: RewardRedemptionResponseDto })
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  @ApiConflictResponse({ type: HttpErrorResponseDto })
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  async cancelRedemption(
    @Param('id') id: string,
    @Body() dto: RedemptionTransitionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return toRewardRedemptionResponseDto(
      await this.rewards.cancelRedemption(
        id,
        dto,
        getAdminOperationContext(request),
      ),
    );
  }

  @Get('admin/rewards')
  @ApiOkResponse({ type: AdminRewardsPageResponseDto })
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  findRewards(@Query() query: AdminRewardsQueryDto) {
    return this.rewards.findAdminRewards(query);
  }

  @Get('admin/redemptions')
  @ApiOkResponse({ type: AdminRedemptionsPageResponseDto })
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  findRedemptions(@Query() query: AdminRedemptionsQueryDto) {
    return this.rewards.findRedemptions(query);
  }
}
