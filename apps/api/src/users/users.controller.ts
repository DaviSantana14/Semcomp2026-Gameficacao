import {
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { AdminProfile } from '@prisma/client';
import { AdminProfiles } from '../auth/admin-profiles.decorator';
import { AdminProfilesGuard } from '../auth/admin-profiles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HttpErrorResponseDto } from '../common/dto/http-error-response.dto';
import type {
  AuthenticatedRequest,
  AuthenticatedUserIdentity,
} from '../common/request-context';
import { toUserResponseDto, UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiSecurity('access-token-cookie')
@Controller('users')
@UseGuards(JwtAuthGuard, AdminProfilesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Obter o usuário autenticado' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Token ausente, inválido ou usuário inativo.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 401,
      message: 'Autenticação necessária ou token inválido.',
      error: 'Unauthorized',
    },
  })
  me(@Req() request: AuthenticatedRequest<AuthenticatedUserIdentity>) {
    return toUserResponseDto(request.user);
  }

  @Get()
  @AdminProfiles(AdminProfile.GENERAL)
  @ApiOperation({ summary: 'Listar usuários (admin)' })
  @ApiOkResponse({ type: UserResponseDto, isArray: true })
  @ApiUnauthorizedResponse({
    description: 'Token ausente ou inválido.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 401,
      message: 'Autenticação necessária ou token inválido.',
      error: 'Unauthorized',
    },
  })
  @ApiForbiddenResponse({
    description: 'Acesso permitido apenas para admins.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 403,
      message: 'Você não tem permissão para acessar este recurso.',
      error: 'Forbidden',
    },
  })
  async findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @AdminProfiles(AdminProfile.GENERAL)
  @ApiOperation({ summary: 'Buscar usuário por id (admin)' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Token ausente ou inválido.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 401,
      message: 'Autenticação necessária ou token inválido.',
      error: 'Unauthorized',
    },
  })
  @ApiForbiddenResponse({
    description: 'Acesso permitido apenas para admins.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 403,
      message: 'Você não tem permissão para acessar este recurso.',
      error: 'Forbidden',
    },
  })
  @ApiNotFoundResponse({
    description: 'Usuário não encontrado.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 404,
      message: 'Usuário não encontrado.',
      error: 'Not Found',
    },
  })
  async findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }
}
