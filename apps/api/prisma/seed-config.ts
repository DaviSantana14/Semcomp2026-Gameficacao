import { isEmail } from 'class-validator';

export const DEMO_PARTICIPANT_PASSWORD = 'semcomp-demo-participante-2026';

export type SeedConfig = {
  mode: 'admin-only' | 'demo';
  admin: {
    name: string;
    cpf: string;
    email: string;
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

  return { mode: environment.SEED_MODE, admin: { name, cpf, email } };
}
