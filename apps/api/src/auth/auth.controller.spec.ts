import type { Response } from 'express';
import { AuthController } from './auth.controller';

const user = {
  id: 'user-1',
  name: 'Ada Lovelace',
  cpf: '12345678900',
  email: 'ada@example.com',
  role: 'PARTICIPANT',
  points: 0,
  xp: 0,
  level: 1,
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date('2026-05-17T12:00:00.000Z'),
};

describe('AuthController', () => {
  it('delegates register to AuthService', async () => {
    const authService = {
      register: jest.fn().mockResolvedValue(user),
      login: jest.fn(),
    };
    const controller = new AuthController(authService as never);
    const registerDto = {
      name: 'Ada Lovelace',
      cpf: '12345678900',
      email: 'ada@example.com',
    };

    await expect(controller.register(registerDto)).resolves.toBe(user);
    expect(authService.register).toHaveBeenCalledWith(registerDto);
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
    const controller = new AuthController(authService as never);
    const cookieMock = jest.fn();
    const response = {
      cookie: cookieMock,
    } as unknown as Response;
    const loginDto = {
      cpf: '12345678900',
      email: 'ada@example.com',
    };

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
});
