import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CsrfGuard } from './csrf.guard';

type TestRequest = {
  method: string;
  headers?: Record<string, string | undefined>;
  user?: {
    csrfToken?: string;
  };
};

function createExecutionContext(request: TestRequest) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('CsrfGuard', () => {
  const guard = new CsrfGuard();

  it('allows safe methods without a CSRF token', () => {
    const context = createExecutionContext({ method: 'GET' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('blocks unsafe methods without a session CSRF token', () => {
    const context = createExecutionContext({
      method: 'POST',
      headers: { 'x-csrf-token': 'token' },
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('blocks unsafe methods without a CSRF header', () => {
    const context = createExecutionContext({
      method: 'POST',
      user: { csrfToken: 'token' },
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('blocks unsafe methods with an incorrect CSRF header', () => {
    const context = createExecutionContext({
      method: 'POST',
      headers: { 'x-csrf-token': 'wrong-token' },
      user: { csrfToken: 'token' },
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows unsafe methods with a matching CSRF header', () => {
    const context = createExecutionContext({
      method: 'POST',
      headers: { 'x-csrf-token': 'token' },
      user: { csrfToken: 'token' },
    });

    expect(guard.canActivate(context)).toBe(true);
  });
});
