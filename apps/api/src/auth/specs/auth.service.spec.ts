import { ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PersistenceUniqueConstraintError } from '../../common/persistence-errors';
import { UsersService } from '../../users/users.service';
import { AuthService } from '../auth.service';

describe(AuthService.name, () => {
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
