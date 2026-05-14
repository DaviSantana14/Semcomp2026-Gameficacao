import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_HEADER = 'x-csrf-token';

type RequestWithCsrf = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  user?: {
    csrfToken?: unknown;
  };
};

function getHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function tokensMatch(firstToken: string, secondToken: string) {
  const firstBuffer = Buffer.from(firstToken);
  const secondBuffer = Buffer.from(secondToken);

  if (firstBuffer.length !== secondBuffer.length) {
    return false;
  }

  return timingSafeEqual(firstBuffer, secondBuffer);
}

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestWithCsrf>();
    const method = request.method?.toUpperCase();

    if (method && SAFE_METHODS.has(method)) {
      return true;
    }

    const csrfToken = request.user?.csrfToken;
    const csrfHeader = getHeaderValue(request.headers?.[CSRF_HEADER]);

    if (
      typeof csrfToken !== 'string' ||
      csrfToken.length === 0 ||
      typeof csrfHeader !== 'string' ||
      csrfHeader.length === 0 ||
      !tokensMatch(csrfHeader, csrfToken)
    ) {
      throw new ForbiddenException(
        'Token CSRF ausente ou inválido para esta operação.',
      );
    }

    return true;
  }
}
