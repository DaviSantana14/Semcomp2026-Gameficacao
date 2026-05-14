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
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { HttpErrorResponseDto } from '../common/dto/http-error-response.dto';
import { AuthService } from './auth.service';
import { getAuthCookieOptions } from './cookie-options';
import { CsrfTokenResponseDto } from './dto/csrf-token-response.dto';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UserResponseDto } from '../users/dto/user-response.dto';

type CsrfRequest = Request & {
  user: {
    csrfToken: string;
  };
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Cadastrar um novo participante' })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiConflictResponse({
    description: 'CPF ou email já cadastrado.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 409,
      message: 'Já existe um usuário com este email.',
      error: 'Conflict',
    },
  })
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autenticar participante e gerar JWT' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({
    description: 'CPF ou email inválido.',
    type: HttpErrorResponseDto,
    example: {
      statusCode: 401,
      message: 'CPF ou email inválido.',
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
  csrf(@Req() request: CsrfRequest) {
    return { csrfToken: request.user.csrfToken };
  }
}
