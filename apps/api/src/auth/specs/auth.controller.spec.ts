import type { CookieOptions, Response } from 'express';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ALLOW_PASSWORD_CHANGE_REQUIRED_KEY } from '../allow-password-change-required.decorator';
import { AllowedOriginGuard } from '../allowed-origin.guard';
import { AuthController } from '../auth.controller';
import { CsrfGuard } from '../csrf.guard';
import { JwtAuthGuard } from '../jwt-auth.guard';

const user = {
  id: 'user-1',
  name: 'Ada Lovelace',
  cpf: '52998224725',
  email: 'ada@example.com',
  role: 'PARTICIPANT',
  points: 0,
  xp: 0,
  level: 1,
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date('2026-05-17T12:00:00.000Z'),
};

const sessionUser = {
  id: 'user-1',
  jti: 'session-1',
  csrfToken: 'csrf-token',
  role: 'PARTICIPANT' as const,
  passwordResetRequired: true,
};

function createController(authService: Record<string, jest.Mock>) {
  return new AuthController(authService as never);
}

describe('AuthController', () => {
  it('requires the configured origin for participant login', () => {
    const loginHandler = Object.getOwnPropertyDescriptor(
      AuthController.prototype,
      'login',
    )?.value as object;

    expect(Reflect.getMetadata(GUARDS_METADATA, loginHandler)).toEqual([
      AllowedOriginGuard,
    ]);
  });

  it('requires the configured origin for administrator login', () => {
    const adminLoginHandler = Object.getOwnPropertyDescriptor(
      AuthController.prototype,
      'adminLogin',
    )?.value as object;

    expect(Reflect.getMetadata(GUARDS_METADATA, adminLoginHandler)).toEqual([
      AllowedOriginGuard,
    ]);
  });

  it.each(['heartbeat', 'logout'])(
    'requires authentication, CSRF and the configured origin for %s',
    (handlerName) => {
      const handler = Object.getOwnPropertyDescriptor(
        AuthController.prototype,
        handlerName,
      )?.value as object;

      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
        JwtAuthGuard,
        CsrfGuard,
        AllowedOriginGuard,
      ]);
    },
  );

  it('allows the required-password endpoint through the auth, CSRF, and origin guards', () => {
    const handler = Object.getOwnPropertyDescriptor(
      AuthController.prototype,
      'changeRequiredPassword',
    )?.value as object;

    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
      JwtAuthGuard,
      CsrfGuard,
      AllowedOriginGuard,
    ]);
    expect(
      Reflect.getMetadata(ALLOW_PASSWORD_CHANGE_REQUIRED_KEY, handler),
    ).toBe(true);
  });

  it('registers in one request that already sets the access token cookie', async () => {
    const authService = {
      register: jest.fn().mockResolvedValue({
        accessToken: 'jwt-token',
        csrfToken: 'csrf-token',
        user,
      }),
      login: jest.fn(),
    };
    const controller = createController(authService);
    const cookieMock = jest.fn();
    const response = { cookie: cookieMock } as unknown as Response;
    const registerDto = {
      name: 'Ada Lovelace',
      cpf: '52998224725',
      email: 'ada@example.com',
      password: 'senha livre',
    };

    const result = await controller.register(registerDto, response);

    expect(authService.register).toHaveBeenCalledWith(registerDto);
    expect(cookieMock).toHaveBeenCalledWith(
      'access_token',
      'jwt-token',
      expect.objectContaining({
        httpOnly: true,
        path: '/',
        maxAge: 8 * 60 * 60 * 1000,
      }),
    );
    expect(result).toEqual({ csrfToken: 'csrf-token', user });
    expect(result).not.toHaveProperty('accessToken');
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('sets the access token cookie and does not return accessToken in the login body', async () => {
    const authService = {
      register: jest.fn(),
      login: jest.fn().mockResolvedValue({
        accessToken: 'jwt-token',
        csrfToken: 'csrf-token',
        user,
      }),
    };
    const controller = createController(authService);
    const cookieMock = jest.fn();
    const response = { cookie: cookieMock } as unknown as Response;
    const loginDto = { email: 'ada@example.com', password: 'senha livre' };

    const result = await controller.login(loginDto, response);

    expect(cookieMock).toHaveBeenCalledWith(
      'access_token',
      'jwt-token',
      expect.objectContaining({
        httpOnly: true,
        path: '/',
        maxAge: 8 * 60 * 60 * 1000,
      }),
    );
    expect(result).toEqual({
      csrfToken: 'csrf-token',
      user,
    });
    expect(result).not.toHaveProperty('accessToken');
  });

  it('sets the access token cookie and does not return accessToken in administrator login', async () => {
    const authService = {
      register: jest.fn(),
      login: jest.fn(),
      adminLogin: jest.fn().mockResolvedValue({
        accessToken: 'jwt-token',
        csrfToken: 'csrf-token',
        user: { ...user, role: 'ADMIN' },
      }),
    };
    const controller = createController(
      authService as Record<string, jest.Mock>,
    );
    const cookieMock = jest.fn();
    const response = { cookie: cookieMock } as unknown as Response;
    const loginDto = {
      cpf: '52998224725',
      email: 'admin@example.com',
      password: 'correct-password',
    };

    await expect(controller.adminLogin(loginDto, response)).resolves.toEqual({
      csrfToken: 'csrf-token',
      user: { ...user, role: 'ADMIN' },
    });
    expect(authService.adminLogin).toHaveBeenCalledWith(loginDto);
    expect(cookieMock).toHaveBeenCalledWith(
      'access_token',
      'jwt-token',
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it('returns the CSRF token of the authenticated session', () => {
    const authService = { heartbeat: jest.fn(), logout: jest.fn() };
    const controller = createController(authService);
    const request = {
      user: { ...sessionUser },
    } as never;

    expect(controller.csrf(request)).toEqual({
      csrfToken: 'csrf-token',
      passwordChangeRequired: true,
    });
  });

  it('completes the required password change before clearing the session cookie', async () => {
    const authService = {
      changeRequiredPassword: jest.fn().mockResolvedValue({
        status: 'changed',
        sessionsRevoked: 1,
      }),
    };
    const controller = createController(authService);
    const clearCookieMock = jest.fn();
    const response = {
      clearCookie: clearCookieMock,
    } as unknown as Response;
    const dto = { newPassword: 'definitive-password' };

    await expect(
      controller.changeRequiredPassword(
        dto,
        { user: { ...sessionUser } } as never,
        response,
      ),
    ).resolves.toBeUndefined();
    expect(authService.changeRequiredPassword).toHaveBeenCalledWith(
      'user-1',
      'session-1',
      dto,
    );
    expect(clearCookieMock).toHaveBeenCalledWith(
      'access_token',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
    expect(
      authService.changeRequiredPassword.mock.invocationCallOrder[0],
    ).toBeLessThan(clearCookieMock.mock.invocationCallOrder[0]);
  });

  it('heartbeats the current persisted session identified by its jti', async () => {
    const authService = {
      heartbeat: jest.fn().mockResolvedValue(true),
      logout: jest.fn(),
    };
    const controller = createController(authService);
    const request = { user: { ...sessionUser } } as never;

    await expect(controller.heartbeat(request)).resolves.toBe(true);
    expect(authService.heartbeat).toHaveBeenCalledWith('session-1', 'user-1');
  });

  it('ends the current persisted session before clearing its cookie on logout', async () => {
    const authService = {
      logout: jest.fn().mockResolvedValue(true),
      heartbeat: jest.fn(),
    };
    const controller = createController(authService);
    const clearCookieMock = jest.fn<void, [string, CookieOptions]>();
    const response = {
      clearCookie: clearCookieMock,
    } as unknown as Response;
    const request = { user: { ...sessionUser } } as never;

    const result = await controller.logout(request, response);

    expect(authService.logout).toHaveBeenCalledWith('session-1', 'user-1');
    expect(clearCookieMock).toHaveBeenCalledWith(
      'access_token',
      expect.objectContaining({
        httpOnly: true,
        path: '/',
      }),
    );
    const clearCookieOptions = clearCookieMock.mock.calls[0]?.[1];
    expect(clearCookieOptions).not.toHaveProperty('maxAge');
    expect(result).toBeUndefined();
    expect(authService.logout.mock.invocationCallOrder[0]).toBeLessThan(
      clearCookieMock.mock.invocationCallOrder[0],
    );
  });
});
