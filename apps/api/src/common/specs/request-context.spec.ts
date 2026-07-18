import {
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AuthenticatedRequest,
  getAdminOperationContext,
} from '../request-context';

describe('getAdminOperationContext', () => {
  it('forms a minimal context from the authenticated user and request ID', () => {
    const request = {
      user: { id: 'admin-1', token: 'must-not-leak' },
      requestId: 'server-request-id',
      headers: { cookie: 'must-not-leak' },
    } as unknown as AuthenticatedRequest<{ id: string; token: string }>;

    expect(getAdminOperationContext(request)).toEqual({
      actorAdminId: 'admin-1',
      requestId: 'server-request-id',
    });
  });

  it('rejects a request without an authenticated user', () => {
    const request = {
      requestId: 'server-request-id',
    } as AuthenticatedRequest;

    expect(() => getAdminOperationContext(request)).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a request without a server request ID', () => {
    const request = {
      user: { id: 'admin-1' },
    } as AuthenticatedRequest;

    expect(() => getAdminOperationContext(request)).toThrow(
      InternalServerErrorException,
    );
  });
});
