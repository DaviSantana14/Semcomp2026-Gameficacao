import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { ensureJwtSecret } from './jwt-env';

type JwtPayload = {
  sub: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: ensureJwtSecret(),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findActiveSummaryById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('Usuário autenticado não encontrado ou inativo.');
    }

    return user satisfies {
      id: string;
      name: string;
      cpf: string;
      email: string;
      role: UserRole;
      isActive: boolean;
      lastLoginAt: Date | null;
      createdAt: Date;
    };
  }
}
