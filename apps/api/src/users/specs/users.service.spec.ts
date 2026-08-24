import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { UserResponseDto } from '../dto/user-response.dto';
import { UsersRepository } from '../users.repository';
import { UsersService } from '../users.service';

const user = {
  id: 'user-1',
  name: 'Ada',
  cpf: '123',
  email: 'ada@example.com',
  role: UserRole.PARTICIPANT,
  points: 10,
  xp: 20,
  level: 1,
  isActive: true,
  lastLoginAt: null,
  adminProfile: null,
  passwordResetRequired: false,
  passwordResetExpiresAt: null,
  createdAt: new Date('2026-07-13T12:00:00.000Z'),
};

describe(UsersService.name, () => {
  let service: UsersService;
  let repository: jest.Mocked<UsersRepository>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: UsersRepository,
          useValue: {
            findAll: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
          },
        },
      ],
    }).compile();
    service = module.get(UsersService);
    repository = module.get(UsersRepository);
  });

  it('serializes the admin user list in the service', async () => {
    repository.findAll.mockResolvedValue([user]);
    const result = await service.findAll();
    expect(result).toEqual([new UserResponseDto(user)]);
    expect(result[0]).toBeInstanceOf(UserResponseDto);
  });

  it('owns the not-found decision for admin lookup', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(service.findById('missing')).rejects.toEqual(
      new NotFoundException('Usuário não encontrado.'),
    );
  });

  it('serializes an admin lookup response in the service', async () => {
    repository.findById.mockResolvedValue(user);
    await expect(service.findById('user-1')).resolves.toEqual(
      new UserResponseDto(user),
    );
  });

  it('uses the semantic repository contract for user creation', async () => {
    repository.create.mockResolvedValue(user);
    const input = { name: 'Ada', cpf: '123', email: 'ada@example.com' };
    await expect(service.create(input)).resolves.toEqual(user);
    expect(repository.create.mock.calls).toEqual([[input]]);
  });

  it('exposes the admin profile and maps reset state without leaking internal fields', () => {
    const response = new UserResponseDto({
      ...user,
      role: UserRole.ADMIN,
      adminProfile: 'SHOP',
      passwordResetRequired: true,
      passwordResetExpiresAt: new Date('2026-07-14T12:00:00.000Z'),
    });

    expect(response).toMatchObject({
      adminProfile: 'SHOP',
      passwordChangeRequired: true,
    });
    expect(response).not.toHaveProperty('passwordResetRequired');
    expect(response).not.toHaveProperty('passwordResetExpiresAt');
  });

  it('returns a null profile and no required password change for participants', () => {
    const response = new UserResponseDto(user);

    expect(response).toMatchObject({
      adminProfile: null,
      passwordChangeRequired: false,
    });
    expect(response).not.toHaveProperty('passwordResetRequired');
  });
});
