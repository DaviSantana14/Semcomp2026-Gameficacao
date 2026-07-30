import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { PersistenceUniqueConstraintError } from '../../common/persistence-errors';
import { UsersService } from '../../users/users.service';
import { AdminPasswordService } from '../admin-password.service';
import { AuthService } from '../auth.service';

describe(AuthService.name, () => {
  it.each([
    ['missing identity', null],
    [
      'participant role',
      {
        id: 'participant-1',
        role: UserRole.PARTICIPANT,
        isActive: true,
        passwordHash: '$2b$12$hash',
      },
    ],
    [
      'inactive administrator',
      {
        id: 'admin-1',
        role: UserRole.ADMIN,
        isActive: false,
        passwordHash: '$2b$12$hash',
      },
    ],
    [
      'administrator without a password hash',
      {
        id: 'admin-1',
        role: UserRole.ADMIN,
        isActive: true,
        passwordHash: null,
      },
    ],
  ])(
    'returns the same public error for %s in administrator login',
    async (_, user) => {
      const usersService = {
        findByCredentialsWithPasswordHash: jest.fn().mockResolvedValue(user),
        updateLastLoginAt: jest.fn(),
      };
      const adminPasswordService = {
        verify: jest.fn().mockResolvedValue(false),
      };
      const module = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: UsersService, useValue: usersService },
          { provide: JwtService, useValue: { signAsync: jest.fn() } },
          { provide: AdminPasswordService, useValue: adminPasswordService },
        ],
      }).compile();
      const service = module.get<AuthService>(AuthService);

      await expect(
        service.adminLogin({
          cpf: '12345678900',
          email: 'admin@example.com',
          password: 'correct-password',
        }),
      ).rejects.toEqual(
        new UnauthorizedException('CPF, email ou senha inválidos.'),
      );
      expect(adminPasswordService.verify).toHaveBeenCalledWith(
        'correct-password',
        user,
      );
      expect(usersService.updateLastLoginAt).not.toHaveBeenCalled();
    },
  );

  it('issues a session for an administrator only after password verification', async () => {
    const admin = {
      id: 'admin-1',
      name: 'Admin',
      cpf: '12345678900',
      email: 'admin@example.com',
      role: UserRole.ADMIN,
      points: 0,
      xp: 0,
      level: 1,
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date('2026-07-30T12:00:00.000Z'),
      passwordHash: '$2b$12$hash',
    };
    const usersService = {
      findByCredentialsWithPasswordHash: jest.fn().mockResolvedValue(admin),
      updateLastLoginAt: jest.fn().mockResolvedValue(admin),
    };
    const adminPasswordService = { verify: jest.fn().mockResolvedValue(true) };
    const jwtService = { signAsync: jest.fn().mockResolvedValue('jwt-token') };
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: AdminPasswordService, useValue: adminPasswordService },
      ],
    }).compile();
    const service = module.get<AuthService>(AuthService);

    const result = await service.adminLogin({
      cpf: admin.cpf,
      email: admin.email,
      password: 'correct-password',
    });

    expect(result.user.role).toBe(UserRole.ADMIN);
    expect(usersService.updateLastLoginAt).toHaveBeenCalledWith(admin.id);
  });

  it('rejects an administrator from the participant login flow', async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findActiveByCredentials: jest.fn().mockResolvedValue({
              id: 'admin-1',
              name: 'Admin',
              cpf: '12345678900',
              email: 'admin@example.com',
              role: UserRole.ADMIN,
              points: 0,
              xp: 0,
              level: 1,
              isActive: true,
              lastLoginAt: null,
              createdAt: new Date(),
            }),
            updateLastLoginAt: jest.fn().mockResolvedValue({
              id: 'admin-1',
              name: 'Admin',
              cpf: '12345678900',
              email: 'admin@example.com',
              role: UserRole.ADMIN,
              points: 0,
              xp: 0,
              level: 1,
              isActive: true,
              lastLoginAt: null,
              createdAt: new Date(),
            }),
          },
        },
        { provide: JwtService, useValue: { signAsync: jest.fn() } },
        { provide: AdminPasswordService, useValue: { verify: jest.fn() } },
      ],
    }).compile();
    const service = module.get(AuthService);

    await expect(
      service.login({ cpf: '12345678900', email: 'admin@example.com' }),
    ).rejects.toEqual(new UnauthorizedException('CPF ou email inválido.'));
  });

  it('maps a neutral repository uniqueness failure without importing Prisma', async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByCpfOrEmail: jest.fn().mockResolvedValue(null),
            create: jest
              .fn()
              .mockRejectedValue(new PersistenceUniqueConstraintError()),
          },
        },
        { provide: JwtService, useValue: { signAsync: jest.fn() } },
        { provide: AdminPasswordService, useValue: { verify: jest.fn() } },
      ],
    }).compile();
    const service = module.get(AuthService);
    await expect(
      service.register({ name: 'Ada', cpf: '123', email: 'ada@example.com' }),
    ).rejects.toEqual(
      new ConflictException('Já existe um usuário com este CPF ou email.'),
    );
  });
});
