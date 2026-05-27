import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
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

@ApiTags('Rewards')
@ApiSecurity('access-token-cookie')
@Controller()
@UseGuards(JwtAuthGuard, CsrfGuard, RolesGuard)
export class RewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  @Post('rewards')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Criar recompensa da lojinha (admin)' })
  @ApiHeader({
    name: 'X-CSRF-Token',
    description: 'Token CSRF retornado no login ou em GET /auth/csrf.',
  })
  @ApiBody({ type: CreateRewardDto })
  @ApiCreatedResponse({ type: RewardResponseDto })
  @ApiUnauthorizedResponse({ type: HttpErrorResponseDto })
  @ApiForbiddenResponse({ type: HttpErrorResponseDto })
  async create(@Body() createRewardDto: CreateRewardDto) {
    const reward = await this.rewardsService.create(createRewardDto);

    return toRewardResponseDto(reward);
  }

  @Get('rewards')
  @ApiOperation({ summary: 'Listar catálogo da lojinha' })
  @ApiOkResponse({ type: RewardResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ type: HttpErrorResponseDto })
  async findAll() {
    const rewards = await this.rewardsService.findAll();

    return rewards.map(toRewardResponseDto);
  }

  @Get('rewards/:id')
  @ApiOperation({ summary: 'Buscar recompensa por id' })
  @ApiOkResponse({ type: RewardResponseDto })
  @ApiUnauthorizedResponse({ type: HttpErrorResponseDto })
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  async findById(@Param('id') id: string) {
    const reward = await this.rewardsService.findById(id);

    if (!reward) {
      throw new NotFoundException('Recompensa não encontrada.');
    }

    return toRewardResponseDto(reward);
  }

  @Patch('rewards/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Editar recompensa da lojinha (admin)' })
  @ApiHeader({
    name: 'X-CSRF-Token',
    description: 'Token CSRF retornado no login ou em GET /auth/csrf.',
  })
  @ApiBody({ type: UpdateRewardDto })
  @ApiOkResponse({ type: RewardResponseDto })
  @ApiUnauthorizedResponse({ type: HttpErrorResponseDto })
  @ApiForbiddenResponse({ type: HttpErrorResponseDto })
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  async update(
    @Param('id') id: string,
    @Body() updateRewardDto: UpdateRewardDto,
  ) {
    const reward = await this.rewardsService.update(id, updateRewardDto);

    return toRewardResponseDto(reward);
  }

  @Post('rewards/:id/redeem')
  @ApiOperation({ summary: 'Resgatar recompensa da lojinha' })
  @ApiHeader({
    name: 'X-CSRF-Token',
    description: 'Token CSRF retornado no login ou em GET /auth/csrf.',
  })
  @ApiCreatedResponse({ type: RewardRedemptionResponseDto })
  @ApiUnauthorizedResponse({ type: HttpErrorResponseDto })
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  async redeem(
    @Param('id') id: string,
    @Req() request: { user: { id: string } },
  ) {
    const redemption = await this.rewardsService.redeem(id, request.user.id);

    return toRewardRedemptionResponseDto(redemption);
  }

  @Get('admin/redemptions/pending')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar resgates pendentes da lojinha (admin)' })
  @ApiOkResponse({ type: RewardRedemptionResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ type: HttpErrorResponseDto })
  @ApiForbiddenResponse({ type: HttpErrorResponseDto })
  async findPendingRedemptions() {
    const redemptions = await this.rewardsService.findPendingRedemptions();

    return redemptions.map(toRewardRedemptionResponseDto);
  }

  @Patch('admin/redemptions/:id/deliver')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Marcar resgate como entregue (admin)' })
  @ApiHeader({
    name: 'X-CSRF-Token',
    description: 'Token CSRF retornado no login ou em GET /auth/csrf.',
  })
  @ApiOkResponse({ type: RewardRedemptionResponseDto })
  @ApiUnauthorizedResponse({ type: HttpErrorResponseDto })
  @ApiForbiddenResponse({ type: HttpErrorResponseDto })
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  async deliverRedemption(@Param('id') id: string) {
    const redemption = await this.rewardsService.deliverRedemption(id);

    return toRewardRedemptionResponseDto(redemption);
  }

  @Patch('admin/redemptions/:id/cancel')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Cancelar resgate pendente (admin)' })
  @ApiHeader({
    name: 'X-CSRF-Token',
    description: 'Token CSRF retornado no login ou em GET /auth/csrf.',
  })
  @ApiOkResponse({ type: RewardRedemptionResponseDto })
  @ApiUnauthorizedResponse({ type: HttpErrorResponseDto })
  @ApiForbiddenResponse({ type: HttpErrorResponseDto })
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  async cancelRedemption(@Param('id') id: string) {
    const redemption = await this.rewardsService.cancelRedemption(id);

    return toRewardRedemptionResponseDto(redemption);
  }
}
