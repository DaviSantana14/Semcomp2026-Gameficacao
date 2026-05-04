import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginUserDto } from './dto/login-user.dto';
import { RegisterUserDto } from './dto/register-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async register(registerUserDto: RegisterUserDto) {
    const { cpf, email, name } = registerUserDto;

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ cpf }, { email }],
      },
    });

    if (existingUser) {
      if (existingUser.cpf === cpf && existingUser.email === email) {
        throw new ConflictException('User with this cpf and email already exists');
      }

      if (existingUser.cpf === cpf) {
        throw new ConflictException('User with this cpf already exists');
      }

      throw new ConflictException('User with this email already exists');
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          name,
          cpf,
          email,
        },
      });

      return this.toResponse(user);
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

  async login(loginUserDto: LoginUserDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        cpf: loginUserDto.cpf,
        email: loginUserDto.email,
        isActive: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid cpf or email');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.toResponse(updatedUser);
  }

  private toResponse(user: User) {
    return {
      id: user.id,
      name: user.name,
      cpf: user.cpf,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }
}
