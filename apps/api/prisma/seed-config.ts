import { isEmail } from 'class-validator';
import { validateAdminPassword } from '../src/auth/password-policy';

export const DEMO_PARTICIPANT_PASSWORD = 'semcomp-demo-participante-2026';

export type SeedConfig = {
  mode: 'admin-only' | 'demo';
  admin: {
    name: string;
    cpf: string;
    email: string;
    password?: string;
  };
};

function getRequiredValue(
  environment: NodeJS.ProcessEnv,
  key: 'SEED_ADMIN_NAME' | 'SEED_ADMIN_CPF' | 'SEED_ADMIN_EMAIL',
) {
  const value = environment[key];

  if (value === undefined) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${key}.`);
  }

  return value.trim();
}

function getRequiredPassword(environment: NodeJS.ProcessEnv) {
  const password = environment.SEED_ADMIN_PASSWORD;

  if (password === undefined || password.length === 0) {
    throw new Error(
      'Variável de ambiente obrigatória ausente: SEED_ADMIN_PASSWORD.',
    );
  }

  validateAdminPassword(password);
  return password;
}

export function getSeedConfig(
  environment: NodeJS.ProcessEnv = process.env,
): SeedConfig {
  if (
    environment.SEED_MODE !== 'admin-only' &&
    environment.SEED_MODE !== 'demo'
  ) {
    throw new Error('SEED_MODE deve ser admin-only ou demo.');
  }

  const name = getRequiredValue(environment, 'SEED_ADMIN_NAME');
  const cpf = getRequiredValue(environment, 'SEED_ADMIN_CPF').replace(
    /\D/g,
    '',
  );
  const email = getRequiredValue(environment, 'SEED_ADMIN_EMAIL').toLowerCase();

  if (!name) {
    throw new Error(
      'Variável de ambiente obrigatória ausente: SEED_ADMIN_NAME.',
    );
  }

  if (!/^\d{11}$/.test(cpf)) {
    throw new Error('SEED_ADMIN_CPF deve conter 11 dígitos.');
  }

  if (!isEmail(email)) {
    throw new Error('SEED_ADMIN_EMAIL deve ser um email válido.');
  }

  const admin = { name, cpf, email };

  if (environment.SEED_MODE === 'demo') {
    return {
      mode: environment.SEED_MODE,
      admin: { ...admin, password: getRequiredPassword(environment) },
    };
  }

  return { mode: environment.SEED_MODE, admin };
}
