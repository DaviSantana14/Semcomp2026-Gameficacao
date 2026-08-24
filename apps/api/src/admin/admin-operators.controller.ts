import { AdminProfile } from '@prisma/client';
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
  ApiCreatedResponse,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { AdminProfiles } from '../auth/admin-profiles.decorator';
import { AdminProfilesGuard } from '../auth/admin-profiles.guard';
import { CsrfGuard } from '../auth/csrf.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  getAdminOperationContext,
  type AuthenticatedRequest,
} from '../common/request-context';
import { AdminOperatorsService } from './admin-operators.service';
import { AdminOperatorsQueryDto } from './dto/admin-operators-query.dto';
import {
  AdminOperatorActivationResponseDto,
  AdminOperatorResponseDto,
  AdminOperatorsPageResponseDto,
} from './dto/admin-operator-response.dto';
import { CreateAdminOperatorDto } from './dto/create-admin-operator.dto';
import { ResetAdminOperatorActivationDto } from './dto/reset-admin-operator-activation.dto';
import { UpdateAdminOperatorDto } from './dto/update-admin-operator.dto';
import { UpdateAdminOperatorStatusDto } from './dto/update-admin-operator-status.dto';

@ApiTags('Admin Operators')
@ApiSecurity('access-token-cookie')
@Controller('admin/operators')
@UseGuards(JwtAuthGuard, CsrfGuard, AdminProfilesGuard)
@AdminProfiles(AdminProfile.GENERAL)
export class AdminOperatorsController {
  constructor(private readonly operators: AdminOperatorsService) {}

  @Get()
  @ApiOkResponse({ type: AdminOperatorsPageResponseDto })
  findAll(@Query() query: AdminOperatorsQueryDto) {
    return this.operators.findAll(query);
  }

  @Post()
  @ApiCreatedResponse({ type: AdminOperatorActivationResponseDto })
  create(
    @Body() dto: CreateAdminOperatorDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.operators.create(dto, getAdminOperationContext(request));
  }

  @Patch(':id')
  @ApiOkResponse({ type: AdminOperatorResponseDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAdminOperatorDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.operators.update(id, dto, getAdminOperationContext(request));
  }

  @Patch(':id/status')
  @ApiOkResponse({ type: AdminOperatorResponseDto })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateAdminOperatorStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.operators.updateStatus(
      id,
      dto,
      getAdminOperationContext(request),
    );
  }

  @Post(':id/activation-reset')
  @ApiCreatedResponse({ type: AdminOperatorActivationResponseDto })
  resetActivation(
    @Param('id') id: string,
    @Body() dto: ResetAdminOperatorActivationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.operators.resetActivation(
      id,
      dto,
      getAdminOperationContext(request),
    );
  }
}
