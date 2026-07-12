import { UserRole } from '@prisma/client';
import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
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

@ApiTags('Claim Codes')
@ApiSecurity('access-token-cookie')
@Controller('admin/actions')
@UseGuards(JwtAuthGuard, CsrfGuard, RolesGuard)
export class ClaimCodesController {
  constructor(private readonly claimCodesService: ClaimCodesService) {}

  @Post(':id/claim-codes/generate')
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
