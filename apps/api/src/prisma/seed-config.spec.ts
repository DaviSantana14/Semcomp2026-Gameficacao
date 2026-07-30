import { getSeedConfig } from '../../prisma/seed-config';

describe('getSeedConfig', () => {
  const validEnvironment = {
    SEED_MODE: 'admin-only',
    SEED_ADMIN_NAME: '  Administração Semcomp  ',
    SEED_ADMIN_CPF: '529.982.247-25',
    SEED_ADMIN_EMAIL: '  ADMIN@SEMCOMP.DEV  ',
  };

  it('lê e normaliza a configuração do administrador', () => {
    expect(getSeedConfig(validEnvironment)).toEqual({
      mode: 'admin-only',
      admin: {
        name: 'Administração Semcomp',
        cpf: '52998224725',
        email: 'admin@semcomp.dev',
      },
    });
  });

  it.each(['', 'ADMIN-ONLY', 'all', 'demo '])(
    'rejeita SEED_MODE inválido: %p',
    (mode) => {
      expect(() =>
        getSeedConfig({ ...validEnvironment, SEED_MODE: mode }),
      ).toThrow('SEED_MODE deve ser admin-only ou demo.');
    },
  );

  it.each(['SEED_ADMIN_NAME', 'SEED_ADMIN_CPF', 'SEED_ADMIN_EMAIL'] as const)(
    'rejeita %s ausente',
    (key) => {
      const environment = { ...validEnvironment };
      delete environment[key];

      expect(() => getSeedConfig(environment)).toThrow(
        `Variável de ambiente obrigatória ausente: ${key}.`,
      );
    },
  );

  it.each(['1234567890', '123456789012', 'abc'])(
    'rejeita CPF inválido: %p',
    (cpf) => {
      expect(() =>
        getSeedConfig({ ...validEnvironment, SEED_ADMIN_CPF: cpf }),
      ).toThrow('SEED_ADMIN_CPF deve conter 11 dígitos.');
    },
  );

  it.each(['admin@', 'admin.semcomp.dev', ''])(
    'rejeita email inválido: %p',
    (email) => {
      expect(() =>
        getSeedConfig({ ...validEnvironment, SEED_ADMIN_EMAIL: email }),
      ).toThrow('SEED_ADMIN_EMAIL deve ser um email válido.');
    },
  );
});
