import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AllowedOriginGuard } from '../allowed-origin.guard';

type TestRequest = {
  headers?: Record<string, string | string[] | undefined>;
};

function createExecutionContext(request: TestRequest) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('AllowedOriginGuard', () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;
  const guard = new AllowedOriginGuard();

  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://semcomp.example.test/app';
  });

  afterAll(() => {
    if (originalFrontendUrl === undefined) {
      delete process.env.FRONTEND_URL;
      return;
    }

    process.env.FRONTEND_URL = originalFrontendUrl;
  });

  it('allows a request with the configured origin', () => {
    const context = createExecutionContext({
      headers: { origin: 'https://semcomp.example.test' },
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('blocks a request with a different origin', () => {
    const context = createExecutionContext({
      headers: { origin: 'https://attacker.example.test' },
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('blocks a request with an invalid origin', () => {
    const context = createExecutionContext({
      headers: { origin: 'not a URL' },
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('blocks a request without origin or referer', () => {
    const context = createExecutionContext({ headers: {} });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('uses the referer origin only when the origin header is absent', () => {
    const context = createExecutionContext({
      headers: { referer: 'https://semcomp.example.test/login?next=%2F' },
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('does not use referer as a fallback when origin is present but invalid', () => {
    const context = createExecutionContext({
      headers: {
        origin: 'not a URL',
        referer: 'https://semcomp.example.test/login',
      },
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
