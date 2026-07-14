import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
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
import type { AuthenticatedRequest } from '../common/request-context';
import {
  RewardRedemptionResponseDto,
  toRewardRedemptionResponseDto,
} from './dto/reward-redemption-response.dto';
import {
  RewardResponseDto,
  toRewardResponseDto,
} from './dto/reward-response.dto';
import { RewardsService } from './rewards.service';

@ApiTags('Rewards')
@ApiSecurity('access-token-cookie')
@Controller()
@UseGuards(JwtAuthGuard, CsrfGuard, RolesGuard)
export class RewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  @Get('rewards')
  @Roles(UserRole.PARTICIPANT)
  @ApiOperation({ summary: 'Listar catálogo da lojinha' })
  @ApiOkResponse({ type: RewardResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ type: HttpErrorResponseDto })
  async findAll() {
    const rewards = await this.rewardsService.findAll();

    return rewards.map(toRewardResponseDto);
  }

  @Get('rewards/:id')
  @Roles(UserRole.PARTICIPANT)
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

  @Post('rewards/:id/redeem')
  @Roles(UserRole.PARTICIPANT)
  @ApiOperation({ summary: 'Resgatar recompensa da lojinha' })
  @ApiHeader({
    name: 'X-CSRF-Token',
    description: 'Token CSRF retornado no login ou em GET /auth/csrf.',
  })
  @ApiCreatedResponse({ type: RewardRedemptionResponseDto })
  @ApiUnauthorizedResponse({ type: HttpErrorResponseDto })
  @ApiForbiddenResponse({
    description: 'Resgate permitido apenas para participantes.',
    type: HttpErrorResponseDto,
  })
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  async redeem(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    const redemption = await this.rewardsService.redeem(id, request.user.id);

    return toRewardRedemptionResponseDto(redemption);
  }
}
