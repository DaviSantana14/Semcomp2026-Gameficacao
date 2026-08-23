import { UserRole } from '@prisma/client';
import { UsersController } from '../users.controller';

describe('UsersController', () => {
  it('returns the authenticated user without csrfToken transport data', () => {
    const controller = new UsersController({} as never);
    const createdAt = new Date('2026-05-17T12:00:00.000Z');

    const result = controller.me({
      user: {
        id: 'user-1',
        name: 'Ada Lovelace',
        cpf: '12345678900',
        email: 'ada@example.com',
        role: UserRole.PARTICIPANT,
        points: 15,
        xp: 30,
        level: 2,
        isActive: true,
        lastLoginAt: null,
        adminProfile: null,
        passwordResetRequired: false,
        passwordResetExpiresAt: null,
        createdAt,
        csrfToken: 'csrf-token',
      },
    });

    expect(result).toEqual({
      id: 'user-1',
      name: 'Ada Lovelace',
      cpf: '12345678900',
      email: 'ada@example.com',
      role: UserRole.PARTICIPANT,
      points: 15,
      xp: 30,
      level: 2,
      isActive: true,
      lastLoginAt: null,
      adminProfile: null,
      passwordChangeRequired: false,
      createdAt,
    });
    expect(result).not.toHaveProperty('csrfToken');
  });
});
