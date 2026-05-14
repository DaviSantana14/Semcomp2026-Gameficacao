import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import { ensureJwtSecret } from './jwt-env';

type JwtPayload = {
  sub: string;
  csrfToken: string;
};

type RequestWithCookieHeader = {
  cookies?: unknown;
};

function extractJwtFromCookie(request: unknown) {
  if (!request || typeof request !== 'object') {
    return null;
  }

  const { cookies } = request as RequestWithCookieHeader;

  if (!cookies || typeof cookies !== 'object') {
    return null;
  }

  const { access_token: token } = cookies as { access_token?: unknown };

  return typeof token === 'string' ? token : null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractJwtFromCookie]),
      ignoreExpiration: false,
      secretOrKey: ensureJwtSecret(),
    });
  }

  async validate(payload: JwtPayload) {
    if (
      typeof payload.csrfToken !== 'string' ||
      payload.csrfToken.length === 0
    ) {
      throw new UnauthorizedException('Sessão inválida. Faça login novamente.');
    }

    const user = await this.usersService.findActiveSummaryById(payload.sub);

    if (!user) {
      throw new UnauthorizedException(
        'Usuário autenticado não encontrado ou inativo.',
      );
    }

    return {
      ...user,
      csrfToken: payload.csrfToken,
    } satisfies {
      id: string;
      name: string;
      cpf: string;
      email: string;
      role: UserRole;
      isActive: boolean;
      lastLoginAt: Date | null;
      createdAt: Date;
      csrfToken: string;
    };
  }
}
