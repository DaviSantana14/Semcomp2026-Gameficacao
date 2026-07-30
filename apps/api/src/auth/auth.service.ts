import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PersistenceUniqueConstraintError } from '../common/persistence-errors';
import { AdminPasswordService } from './admin-password.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UsersService } from '../users/users.service';
import { toUserResponseDto } from '../users/dto/user-response.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly adminPasswordService: AdminPasswordService,
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
      if (error instanceof PersistenceUniqueConstraintError) {
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

    if (!user || user.role !== UserRole.PARTICIPANT) {
      throw new UnauthorizedException('CPF ou email inválido.');
    }

    const updatedUser = await this.usersService.updateLastLoginAt(user.id);
    return this.createSession(updatedUser);
  }

  async adminLogin(loginDto: AdminLoginDto) {
    const user = await this.usersService.findByCredentialsWithPasswordHash(
      loginDto.cpf,
      loginDto.email,
    );
    const passwordMatches = await this.adminPasswordService.verify(
      loginDto.password,
      user,
    );

    if (!passwordMatches || !user) {
      throw new UnauthorizedException('CPF, email ou senha inválidos.');
    }

    const updatedUser = await this.usersService.updateLastLoginAt(user.id);
    return this.createSession(updatedUser);
  }

  private async createSession(user: {
    id: string;
    name: string;
    cpf: string;
    email: string;
    role: UserRole;
    points: number;
    xp: number;
    level: number;
    isActive: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
  }) {
    const csrfToken = randomBytes(32).toString('base64url');

    return {
      accessToken: await this.jwtService.signAsync(
        { sub: user.id, csrfToken },
        { expiresIn: '8h' },
      ),
      csrfToken,
      user: toUserResponseDto(user),
    };
  }
}
