import {
  DEMO_PARTICIPANT_PASSWORD,
  getSeedConfig,
} from '../../prisma/seed-config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const seedSource = readFileSync(join(process.cwd(), 'prisma/seed.ts'), 'utf8');
const seedAdminSource = readFileSync(
  join(process.cwd(), 'prisma/seed-admin.ts'),
  'utf8',
);

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

  it('não embute credenciais de participante fora do modo demo', () => {
    const config = getSeedConfig(validEnvironment);

    expect(config).not.toHaveProperty('participant');
    expect(Object.keys(config)).toEqual(['mode', 'admin']);
    expect(JSON.stringify(config)).not.toContain(DEMO_PARTICIPANT_PASSWORD);
  });

  it('expõe apenas uma senha local documentada e não secreta para o demo', () => {
    expect(typeof DEMO_PARTICIPANT_PASSWORD).toBe('string');
    expect(DEMO_PARTICIPANT_PASSWORD.length).toBeGreaterThanOrEqual(8);
    expect(
      Buffer.byteLength(DEMO_PARTICIPANT_PASSWORD, 'utf8'),
    ).toBeLessThanOrEqual(72);
  });

  it('requires the admin password only for the local demo seed', () => {
    expect(() =>
      getSeedConfig({ ...validEnvironment, SEED_MODE: 'demo' }),
    ).toThrow('Variável de ambiente obrigatória ausente: SEED_ADMIN_PASSWORD.');

    expect(
      getSeedConfig({
        ...validEnvironment,
        SEED_MODE: 'demo',
        SEED_ADMIN_PASSWORD: 'local-demo-password',
      }),
    ).toEqual({
      mode: 'demo',
      admin: {
        name: 'Administração Semcomp',
        cpf: '52998224725',
        email: 'admin@semcomp.dev',
        password: 'local-demo-password',
      },
    });
  });

  it('rejects an invalid local demo admin password', () => {
    expect(() =>
      getSeedConfig({
        ...validEnvironment,
        SEED_MODE: 'demo',
        SEED_ADMIN_PASSWORD: 'too-short',
      }),
    ).toThrow('Invalid administrator password.');
  });

  it('cria o admin inicial como geral sem resetar o estado operacional no rerun', () => {
    expect(seedAdminSource).toContain('adminProfile: AdminProfile.GENERAL');
    expect(seedSource).toContain('adminProfile: user.adminProfile');
    expect(seedSource).not.toMatch(
      /update:\s*\{[\s\S]*?role: user\.role,[\s\S]*?isActive:\s*true/,
    );
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
