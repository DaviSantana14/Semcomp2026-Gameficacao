import { UnauthorizedException } from '@nestjs/common';
import { AdminProfile } from '@prisma/client';
import { PersistenceUniqueConstraintError } from '../../common/persistence-errors';
import { AdminPasswordService } from '../../auth/admin-password.service';
import {
  AdminOperatorsService,
  toOperatorState,
} from '../admin-operators.service';

const now = new Date('2026-08-23T12:00:00.000Z');
const operator = {
  id: 'operator-1',
  name: 'Bia Operadora',
  cpf: '12345678901',
  email: 'bia@example.com',
  adminProfile: AdminProfile.SHOP,
  isActive: true,
  passwordHash: '$2b$12$hash',
  passwordChangedAt: now,
  lastLoginAt: now,
  createdAt: now,
  updatedAt: now,
  activationExpiresAt: null,
};

describe(AdminOperatorsService.name, () => {
  const repository = {
    withTransaction: jest.fn(),
    findOperatorPage: jest.fn(),
    findOperatorById: jest.fn(),
    lockAvailableGenerals: jest.fn(),
    lockOperator: jest.fn(),
    createOperator: jest.fn(),
    updateOperator: jest.fn(),
    revokeOpenSessions: jest.fn(),
    revokePendingActivations: jest.fn(),
    resetOperator: jest.fn(),
    consumeActivation: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const adminPassword = {
    hash: jest.fn(),
  };
  let service: AdminOperatorsService;

  const context = { actorAdminId: 'general-1', requestId: 'request-1' };
  const transaction = { auditWriter: { create: jest.fn() } };

  beforeEach(() => {
    jest.clearAllMocks();
    repository.withTransaction.mockImplementation(
      (callback: (value: typeof repository) => unknown) => callback(repository),
    );
    Object.assign(repository, { auditWriter: transaction.auditWriter });
    repository.lockAvailableGenerals.mockResolvedValue([
      { id: 'general-1' },
      { id: 'general-2' },
    ]);
    repository.revokeOpenSessions.mockResolvedValue(2);
    repository.revokePendingActivations.mockResolvedValue(1);
    service = new AdminOperatorsService(
      repository as never,
      audit as never,
      adminPassword as unknown as AdminPasswordService,
    );
  });

  it.each([
    [{ isActive: true, passwordHash: null }, 'PENDING_ACTIVATION'],
    [{ isActive: true, passwordHash: 'hash' }, 'ACTIVE'],
    [{ isActive: false, passwordHash: 'hash' }, 'INACTIVE'],
  ] as const)(
    'derives operator state from existing fields',
    (input, expected) => {
      expect(toOperatorState(input)).toBe(expected);
    },
  );

  it('creates an operator and returns the activation secret once', async () => {
    repository.createOperator.mockResolvedValue({
      ...operator,
      passwordHash: null,
      passwordChangedAt: null,
      activationExpiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    });

    const result = await service.create(
      {
        name: '  Bia Operadora  ',
        cpf: '123.456.789-01',
        email: ' BIA@EXAMPLE.COM ',
        adminProfile: AdminProfile.SHOP,
        reason: 'Cadastro de operadora para a loja',
      },
      context,
    );

    expect(result.activationCode).toMatch(/^[A-Z2-9]{5}(?:-[A-Z2-9]{5}){3}$/);
    expect(result.operator).not.toHaveProperty('passwordHash');
    expect(repository.createOperator).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Bia Operadora',
        cpf: '12345678901',
        email: 'bia@example.com',
        adminProfile: AdminProfile.SHOP,
        createdByAdminId: 'general-1',
      }),
    );
  });

  it('maps unique CPF/email conflicts to a generic conflict', async () => {
    repository.createOperator.mockRejectedValue(
      new PersistenceUniqueConstraintError(),
    );

    await expect(
      service.create(
        {
          name: 'Bia Operadora',
          cpf: '12345678901',
          email: 'bia@example.com',
          adminProfile: AdminProfile.SHOP,
          reason: 'Cadastro de operadora para a loja',
        },
        context,
      ),
    ).rejects.toMatchObject({
      status: 409,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      response: expect.objectContaining({
        message: 'Não foi possível concluir o cadastro do operador.',
      }),
    });
  });

  it('protects the last active general from inactivation', async () => {
    repository.lockAvailableGenerals.mockResolvedValue([{ id: 'general-1' }]);
    repository.lockOperator.mockResolvedValue({
      ...operator,
      id: 'general-1',
      adminProfile: AdminProfile.GENERAL,
      passwordHash: '$2b$12$hash',
      isActive: true,
    });

    await expect(
      service.updateStatus(
        'general-1',
        { isActive: false, reason: 'Desativacao do operador geral' },
        context,
      ),
    ).rejects.toMatchObject({
      status: 409,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      response: expect.objectContaining({ code: 'LAST_ACTIVE_GENERAL_ADMIN' }),
    });
    expect(repository.updateOperator).not.toHaveBeenCalled();
  });

  it('resets an operator by revoking sessions, clearing the password and issuing a new activation', async () => {
    repository.lockOperator.mockResolvedValue(operator);
    repository.resetOperator.mockResolvedValue({
      ...operator,
      passwordHash: null,
      passwordChangedAt: null,
      isActive: true,
      activationExpiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    });

    const result = await service.resetActivation(
      'operator-1',
      { reason: 'Reset de acesso da operadora' },
      context,
    );

    expect(result.activationCode).toMatch(/^[A-Z2-9]{5}(?:-[A-Z2-9]{5}){3}$/);
    expect(repository.revokeOpenSessions).toHaveBeenCalledWith(
      'operator-1',
      expect.any(Date),
    );
    expect(repository.resetOperator).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'operator-1' }),
    );
  });

  it('normalizes invalid public activation into one indistinguishable error', async () => {
    adminPassword.hash.mockResolvedValue('$2b$12$hash');
    repository.consumeActivation.mockRejectedValue(
      new UnauthorizedException({
        code: 'ADMIN_ACTIVATION_INVALID',
        message: 'Código de ativação inválido ou expirado.',
      }),
    );

    await expect(
      service.activate(
        {
          code: 'ABCDE-FGHJK-LMNPQ-RST23',
          cpf: '12345678901',
          email: 'bia@example.com',
          password: 'senha-administrativa-segura',
          passwordConfirmation: 'senha-administrativa-segura',
        },
        'request-1',
      ),
    ).rejects.toMatchObject({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      response: expect.objectContaining({ code: 'ADMIN_ACTIVATION_INVALID' }),
    });
  });
});
