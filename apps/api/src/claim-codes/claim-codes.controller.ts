import { UserRole } from '@prisma/client';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiConflictResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOperation,
  ApiSecurity,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CsrfGuard } from '../auth/csrf.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { HttpErrorResponseDto } from '../common/dto/http-error-response.dto';
import { ClaimCodesService } from './claim-codes.service';
import { GenerateClaimCodesDto } from './dto/generate-claim-codes.dto';
import { GeneratedClaimCodesResponseDto } from './dto/generated-claim-codes-response.dto';
import { ClaimCodesQueryDto } from './dto/claim-codes-query.dto';
import {
  ClaimCodeHistoryResponseDto,
  ClaimCodesPageResponseDto,
} from './dto/claim-code-history-response.dto';
import { UpdateClaimCodeStatusDto } from './dto/update-claim-code-status.dto';

@ApiTags('Claim Codes')
@ApiSecurity('access-token-cookie')
@Controller('admin')
@UseGuards(JwtAuthGuard, CsrfGuard, RolesGuard)
export class ClaimCodesController {
  constructor(private readonly claimCodesService: ClaimCodesService) {}

  @Get('claim-codes')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar histórico de códigos de uso único (admin)' })
  @ApiOkResponse({ type: ClaimCodesPageResponseDto })
  findAll(@Query() query: ClaimCodesQueryDto) {
    return this.claimCodesService.findAll(query);
  }

  @Patch('claim-codes/:id/status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Ativar ou desativar código de uso único (admin)' })
  @ApiOkResponse({ type: ClaimCodeHistoryResponseDto })
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  @ApiConflictResponse({ type: HttpErrorResponseDto })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateClaimCodeStatusDto) {
    return this.claimCodesService.updateStatus(id, dto);
  }

  @Post('actions/:id/claim-codes/generate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Gerar lote de códigos de uso único (admin)' })
  @ApiHeader({
    name: 'X-CSRF-Token',
    description: 'Token CSRF retornado no login ou em GET /auth/csrf.',
  })
  @ApiBody({ type: GenerateClaimCodesDto })
  @ApiCreatedResponse({ type: GeneratedClaimCodesResponseDto })
  @ApiUnauthorizedResponse({ type: HttpErrorResponseDto })
  @ApiForbiddenResponse({ type: HttpErrorResponseDto })
  @ApiNotFoundResponse({ type: HttpErrorResponseDto })
  @ApiServiceUnavailableResponse({ type: HttpErrorResponseDto })
  generate(
    @Param('id') id: string,
    @Body() { quantity }: GenerateClaimCodesDto,
  ) {
    return this.claimCodesService.generateBatch(id, quantity);
  }
}
