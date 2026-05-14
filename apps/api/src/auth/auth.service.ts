import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UsersService } from '../users/users.service';
import { toUserResponseDto } from '../users/dto/user-response.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    const existingUser = await this.usersService.findByCpfOrEmail(
      registerDto.cpf,
      registerDto.email,
    );

    if (existingUser) {
      if (
        existingUser.cpf === registerDto.cpf &&
        existingUser.email === registerDto.email
      ) {
        throw new ConflictException(
          'Já existe um usuário com este CPF e este email.',
        );
      }

      if (existingUser.cpf === registerDto.cpf) {
        throw new ConflictException('Já existe um usuário com este CPF.');
      }

      throw new ConflictException('Já existe um usuário com este email.');
    }

    try {
      const user = await this.usersService.create(registerDto);

      return toUserResponseDto(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Já existe um usuário com este CPF ou email.',
        );
      }

      throw error;
    }
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findActiveByCredentials(
      loginDto.cpf,
      loginDto.email,
    );

    if (!user) {
      throw new UnauthorizedException('CPF ou email inválido.');
    }

    const updatedUser = await this.usersService.updateLastLoginAt(user.id);
    const csrfToken = randomBytes(32).toString('base64url');

    return {
      accessToken: await this.jwtService.signAsync(
        { sub: updatedUser.id, csrfToken },
        { expiresIn: '8h' },
      ),
      csrfToken,
      user: toUserResponseDto(updatedUser),
    };
  }
}
