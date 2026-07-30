import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

type RequestWithOrigin = {
  headers?: Record<string, string | string[] | undefined>;
};

function getHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function getUrlOrigin(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  try {
    const origin = new URL(value).origin;
    return origin === 'null' ? undefined : origin;
  } catch {
    return undefined;
  }
}

@Injectable()
export class AllowedOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestWithOrigin>();
    const originHeader = getHeaderValue(request.headers?.origin);
    const requestOrigin = getUrlOrigin(
      originHeader ?? getHeaderValue(request.headers?.referer),
    );
    const frontendOrigin = getUrlOrigin(process.env.FRONTEND_URL);

    if (!requestOrigin || !frontendOrigin || requestOrigin !== frontendOrigin) {
      throw new ForbiddenException('Origem não autorizada para esta operação.');
    }

    return true;
  }
}
