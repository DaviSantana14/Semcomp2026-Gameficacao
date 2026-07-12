import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CsrfGuard } from '../auth/csrf.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { HttpErrorResponseDto } from '../common/dto/http-error-response.dto';
import { ActionsService } from './actions.service';
import { AdminActionResponseDto } from './dto/admin-action-response.dto';
import { AdminActionsQueryDto } from './dto/admin-actions-query.dto';
import {
  ReusableCodeHistoryResponseDto,
  ReusableCodeRedemptionResponseDto,
} from './dto/reusable-code-history-response.dto';
import {
  ReusableCodeRedemptionsQueryDto,
  ReusableCodesQueryDto,
} from './dto/reusable-codes-query.dto';
import { UpdateActionDto } from './dto/update-action.dto';

@ApiTags('Admin Actions')
@ApiSecurity('access-token-cookie')
@Controller('admin')
@UseGuards(JwtAuthGuard, CsrfGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiUnauthorizedResponse({ type: HttpErrorResponseDto })
@ApiForbiddenResponse({ type: HttpErrorResponseDto })
export class AdminActionsController {
  constructor(private readonly actions: ActionsService) {}

  @Get('actions')
  @ApiOkResponse({ type: AdminActionResponseDto, isArray: true })
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  findAll(@Query() query: AdminActionsQueryDto) {
    return this.actions.findAdminActions(query);
  }

  @Patch('actions/:id')
  @ApiOkResponse({ type: AdminActionResponseDto })
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  @ApiConflictResponse({ type: HttpErrorResponseDto })
  update(@Param('id') id: string, @Body() dto: UpdateActionDto) {
    return this.actions.update(id, dto);
  }

  @Get('reusable-codes')
  @ApiOkResponse({ type: ReusableCodeHistoryResponseDto, isArray: true })
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  findReusableCodes(@Query() query: ReusableCodesQueryDto) {
    return this.actions.findReusableCodes(query);
  }

  @Get('reusable-codes/:actionId/redemptions')
  @ApiOkResponse({ type: ReusableCodeRedemptionResponseDto, isArray: true })
  @ApiBadRequestResponse({ type: HttpErrorResponseDto })
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  findReusableCodeRedemptions(
    @Param('actionId') actionId: string,
    @Query() query: ReusableCodeRedemptionsQueryDto,
  ) {
    return this.actions.findReusableCodeRedemptions(actionId, query);
  }
}
