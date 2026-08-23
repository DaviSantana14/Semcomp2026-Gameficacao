import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ALLOW_PASSWORD_CHANGE_REQUIRED_KEY } from './allow-password-change-required.decorator';

type RequestWithAuthenticatedUser = {
  user?: {
    passwordResetRequired?: unknown;
  };
};

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector = new Reflector()) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    const authenticated = await super.canActivate(context);
    if (!authenticated) return authenticated;

    const allowPasswordChange = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PASSWORD_CHANGE_REQUIRED_KEY,
      [context.getHandler(), context.getClass()],
    );
    const request = context
      .switchToHttp()
      .getRequest<RequestWithAuthenticatedUser>();

    if (
      request.user?.passwordResetRequired === true &&
      allowPasswordChange !== true
    ) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Defina uma nova senha para continuar.',
      });
    }

    return true;
  }

  handleRequest<TUser = unknown>(err: unknown, user: TUser) {
    if (err || !user) {
      throw new UnauthorizedException(
        'Autenticação necessária ou token inválido.',
      );
    }

    return user;
  }
}
