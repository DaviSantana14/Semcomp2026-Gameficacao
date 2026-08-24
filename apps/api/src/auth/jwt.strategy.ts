import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { AdminProfile, UserRole } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { SessionsService } from '../presence/sessions.service';
import { ensureJwtSecret } from './jwt-env';

type JwtPayload = {
  sub?: unknown;
  csrfToken?: unknown;
  jti?: unknown;
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
  constructor(private readonly sessionsService: SessionsService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractJwtFromCookie]),
      ignoreExpiration: false,
      secretOrKey: ensureJwtSecret(),
    });
  }

  async validate(payload: JwtPayload) {
    const csrfToken = payload.csrfToken;
    const sub = payload.sub;
    const jti = payload.jti;

    if (
      typeof csrfToken !== 'string' ||
      csrfToken.length === 0 ||
      typeof sub !== 'string' ||
      sub.length === 0 ||
      typeof jti !== 'string' ||
      jti.length === 0
    ) {
      throw new UnauthorizedException('Sessão inválida. Faça login novamente.');
    }

    const identity = await this.sessionsService.validate(jti, sub);

    if (!identity) {
      throw new UnauthorizedException(
        'Usuário autenticado não encontrado ou inativo.',
      );
    }

    return {
      ...identity,
      csrfToken,
    } satisfies {
      id: string;
      name: string;
      cpf: string;
      email: string;
      role: UserRole;
      isActive: boolean;
      adminProfile: AdminProfile | null;
      passwordResetRequired: boolean;
      passwordResetExpiresAt: Date | null;
      lastLoginAt: Date | null;
      createdAt: Date;
      jti: string;
      csrfToken: string;
    };
  }
}
