import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UsersService } from '../users/users.service';
import {
  toUserResponseDto,
  UserResponseDto,
} from '../users/dto/user-response.dto';

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
        throw new ConflictException('User with this cpf and email already exists');
      }

      if (existingUser.cpf === registerDto.cpf) {
        throw new ConflictException('User with this cpf already exists');
      }

      throw new ConflictException('User with this email already exists');
    }

    try {
      const user = await this.usersService.create(registerDto);

      return toUserResponseDto(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('User with this cpf or email already exists');
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
      throw new UnauthorizedException('Invalid cpf or email');
    }

    const updatedUser = await this.usersService.updateLastLoginAt(user.id);

    return {
      accessToken: await this.jwtService.signAsync({ sub: updatedUser.id }),
      user: toUserResponseDto(updatedUser),
    };
  }
}
