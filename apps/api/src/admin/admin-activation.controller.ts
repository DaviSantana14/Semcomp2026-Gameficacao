import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { AllowedOriginGuard } from '../auth/allowed-origin.guard';
import type { RequestWithRequestId } from '../common/request-context';
import { RateLimitPolicy } from '../security/rate-limit-policy.decorator';
import { AdminOperatorsService } from './admin-operators.service';
import { ActivateAdminDto } from './dto/activate-admin.dto';

@ApiTags('Auth')
@Controller('auth/admin')
export class AdminActivationController {
  constructor(private readonly operators: AdminOperatorsService) {}

  @Post('activate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AllowedOriginGuard)
  @RateLimitPolicy('activation')
  @ApiNoContentResponse({ description: 'Administrador ativado.' })
  async activate(
    @Body() dto: ActivateAdminDto,
    @Req() request: RequestWithRequestId,
  ) {
    await this.operators.activate(dto, request.requestId ?? '');
  }
}
