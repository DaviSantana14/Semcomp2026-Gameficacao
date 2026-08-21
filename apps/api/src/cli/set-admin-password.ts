import { AdminPasswordService } from '../auth/admin-password.service';
import { validateAdminPassword } from '../auth/password-policy';
import { PrismaService } from '../prisma/prisma.service';
import { UsersRepository } from '../users/users.repository';
import { UsersService } from '../users/users.service';

const GENERIC_FAILURE_MESSAGE =
  'Não foi possível atualizar a senha administrativa.\n';
const SUCCESS_MESSAGE = 'Senha administrativa atualizada.\n';

export type SetAdminPasswordDependencies = {
  hashPassword: (password: string) => Promise<string>;
  setAdminPassword: (
    cpf: string,
    email: string,
    passwordHash: string,
  ) => Promise<boolean>;
  write: (message: string) => void;
};

function parseStdin(input: string) {
  const lines = input.split(/\r?\n/);

  if (lines.at(-1) === '') {
    lines.pop();
  }

  if (lines.length !== 4) {
    return null;
  }

  const [cpf, email, password, confirmation] = lines;

  if (
    cpf === undefined ||
    email === undefined ||
    password === undefined ||
    confirmation === undefined
  ) {
    return null;
  }

  return {
    cpf: cpf.replace(/\D/g, ''),
    email: email.trim().toLowerCase(),
    password,
    confirmation,
  };
}

export async function runSetAdminPassword(
  input: string,
  argumentsList: readonly string[],
  dependencies: SetAdminPasswordDependencies,
) {
  if (argumentsList.length > 0) {
    dependencies.write(GENERIC_FAILURE_MESSAGE);
    return 1;
  }

  const values = parseStdin(input);

  if (!values) {
    dependencies.write(GENERIC_FAILURE_MESSAGE);
    return 1;
  }

  try {
    validateAdminPassword(values.password, values.confirmation);
    const passwordHash = await dependencies.hashPassword(values.password);
    const updated = await dependencies.setAdminPassword(
      values.cpf,
      values.email,
      passwordHash,
    );

    dependencies.write(updated ? SUCCESS_MESSAGE : GENERIC_FAILURE_MESSAGE);
    return updated ? 0 : 1;
  } catch {
    dependencies.write(GENERIC_FAILURE_MESSAGE);
    return 1;
  }
}

async function readStdin() {
  let input = '';
  process.stdin.setEncoding('utf8');

  for await (const chunk of process.stdin as AsyncIterable<string>) {
    input += chunk;
  }

  return input;
}

async function main() {
  const prisma = new PrismaService();
  const usersService = new UsersService(new UsersRepository(prisma));
  const passwordService = new AdminPasswordService();

  try {
    process.exitCode = await runSetAdminPassword(
      await readStdin(),
      process.argv.slice(2),
      {
        hashPassword: async (password) => passwordService.hash(password),
        setAdminPassword: async (cpf, email, passwordHash) =>
          usersService.setAdminPassword(cpf, email, passwordHash),
        write: (message) => process.stdout.write(message),
      },
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch(() => {
    process.stdout.write(GENERIC_FAILURE_MESSAGE);
    process.exitCode = 1;
  });
}
