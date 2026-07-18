import {
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

export type RequestWithRequestId = Request & {
  requestId?: string;
};

export type AuthenticatedRequest<TUser = { id: string }> =
  RequestWithRequestId & {
    user: TUser;
  };

export type AdminOperationContext = {
  actorAdminId: string;
  requestId: string;
};

type AdminContextRequest = RequestWithRequestId & {
  user?: {
    id?: unknown;
  };
};

export function getAdminOperationContext(
  request: AdminContextRequest,
): AdminOperationContext {
  const actorAdminId = request.user?.id;

  if (typeof actorAdminId !== 'string' || actorAdminId.length === 0) {
    throw new UnauthorizedException('Autenticação administrativa necessária.');
  }

  if (typeof request.requestId !== 'string' || request.requestId.length === 0) {
    throw new InternalServerErrorException(
      'Identificador da requisição indisponível.',
    );
  }

  return {
    actorAdminId,
    requestId: request.requestId,
  };
}
