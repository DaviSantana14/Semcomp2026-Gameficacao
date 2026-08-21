import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { HttpErrorResponseDto } from '../common/dto/http-error-response.dto';
import type {
  AuthenticatedRequest,
  AuthenticatedUserIdentity,
} from '../common/request-context';
import { AuthService } from './auth.service';
import { AllowedOriginGuard } from './allowed-origin.guard';
import {
  getAuthCookieOptions,
  getClearAuthCookieOptions,
} from './cookie-options';
import { CsrfGuard } from './csrf.guard';
import { CsrfTokenResponseDto } from './dto/csrf-token-response.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

type ControllerRequest = AuthenticatedRequest<AuthenticatedUserIdentity>;

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Cadastrar um novo participante e iniciar a sessão',
  })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({ type: LoginResponseDto })
  @ApiConflictResponse({
    description: 'CPF ou email já cadastrado.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 409,
      message: 'Já existe um usuário com este CPF ou email.',
      error: 'Conflict',
    },
  })
  async register(
    @Body() registerDto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { accessToken, csrfToken, user } =
      await this.authService.register(registerDto);

    response.cookie('access_token', accessToken, getAuthCookieOptions(true));

    return { csrfToken, user };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AllowedOriginGuard)
  @ApiOperation({ summary: 'Autenticar participante com email e senha' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Email ou senha inválidos.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 401,
      message: 'Email ou senha inválidos.',
      error: 'Unauthorized',
    },
  })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { accessToken, csrfToken, user } =
      await this.authService.login(loginDto);

    response.cookie('access_token', accessToken, getAuthCookieOptions(true));

    return { csrfToken, user };
  }

  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AllowedOriginGuard)
  @ApiOperation({ summary: 'Autenticar administrador e gerar JWT' })
  @ApiBody({ type: AdminLoginDto })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({
    description: 'CPF, email ou senha inválidos.',
    type: HttpErrorResponseDto,
  })
  async adminLogin(
    @Body() loginDto: AdminLoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { accessToken, csrfToken, user } =
      await this.authService.adminLogin(loginDto);

    response.cookie('access_token', accessToken, getAuthCookieOptions(true));

    return { csrfToken, user };
  }

  @Get('csrf')
  @UseGuards(JwtAuthGuard)
  @ApiSecurity('access-token-cookie')
  @ApiOperation({ summary: 'Obter token CSRF da sessão autenticada' })
  @ApiOkResponse({ type: CsrfTokenResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Token ausente ou inválido.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 401,
      message: 'Autenticação necessária ou token inválido.',
      error: 'Unauthorized',
    },
  })
  csrf(@Req() request: ControllerRequest) {
    return { csrfToken: request.user.csrfToken };
  }

  @Post('heartbeat')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, CsrfGuard, AllowedOriginGuard)
  @ApiSecurity('access-token-cookie')
  @ApiOperation({ summary: 'Atualizar presença da sessão autenticada' })
  @ApiNoContentResponse({ description: 'Presença atualizada.' })
  @ApiUnauthorizedResponse({
    description: 'Sessão inválida ou expirada.',
    type: HttpErrorResponseDto,
  })
  heartbeat(@Req() request: ControllerRequest) {
    return this.authService.heartbeat(request.user.jti, request.user.id);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, CsrfGuard, AllowedOriginGuard)
  @ApiOperation({ summary: 'Encerrar sessão autenticada' })
  @ApiNoContentResponse({ description: 'Sessão encerrada.' })
  async logout(
    @Req() request: ControllerRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(request.user.jti, request.user.id);
    response.clearCookie('access_token', getClearAuthCookieOptions());
  }
}
