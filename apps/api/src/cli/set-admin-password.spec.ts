import {
  runSetAdminPassword,
  type SetAdminPasswordDependencies,
} from './set-admin-password';

const password = 'correct-password';

function createDependencies() {
  const hashPassword = jest
    .fn<Promise<string>, [string]>()
    .mockResolvedValue('$2b$12$hash');
  const setAdminPassword = jest
    .fn<Promise<boolean>, [string, string, string]>()
    .mockResolvedValue(true);
  const write = jest.fn<void, [string]>();

  return {
    dependencies: {
      hashPassword,
      setAdminPassword,
      write,
    } satisfies SetAdminPasswordDependencies,
    hashPassword,
    setAdminPassword,
    write,
  };
}

describe('set-admin-password CLI', () => {
  it('reads credentials and the password only from stdin, without echoing secrets', async () => {
    const { dependencies, hashPassword, setAdminPassword, write } =
      createDependencies();

    await expect(
      runSetAdminPassword(
        `123.456.789-00\nAdmin@Example.com\n${password}\n${password}\n`,
        [],
        dependencies,
      ),
    ).resolves.toBe(0);

    expect(hashPassword).toHaveBeenCalledWith(password);
    expect(setAdminPassword).toHaveBeenCalledWith(
      '12345678900',
      'admin@example.com',
      '$2b$12$hash',
    );
    expect(write).toHaveBeenCalledWith('Senha administrativa atualizada.\n');
    expect(write.mock.calls.flat().join('')).not.toContain(password);
  });

  it('does not accept a password from command arguments or the environment', async () => {
    const { dependencies, hashPassword, setAdminPassword, write } =
      createDependencies();
    const originalPassword = process.env.ADMIN_PASSWORD;
    process.env.ADMIN_PASSWORD = password;

    try {
      await expect(
        runSetAdminPassword('', ['--password', password], dependencies),
      ).resolves.toBe(1);
    } finally {
      if (originalPassword === undefined) {
        delete process.env.ADMIN_PASSWORD;
      } else {
        process.env.ADMIN_PASSWORD = originalPassword;
      }
    }

    expect(hashPassword).not.toHaveBeenCalled();
    expect(setAdminPassword).not.toHaveBeenCalled();
    expect(write.mock.calls.flat().join('')).not.toContain(password);
  });

  it('does not reveal the identity or password when the update fails', async () => {
    const { dependencies, setAdminPassword, write } = createDependencies();
    setAdminPassword.mockResolvedValue(false);

    await expect(
      runSetAdminPassword(
        `12345678900\nadmin@example.com\n${password}\n${password}\n`,
        [],
        dependencies,
      ),
    ).resolves.toBe(1);

    expect(write).toHaveBeenCalledWith(
      'Não foi possível atualizar a senha administrativa.\n',
    );
    const output = write.mock.calls.flat().join('');
    expect(output).not.toContain('12345678900');
    expect(output).not.toContain('admin@example.com');
    expect(output).not.toContain(password);
  });
});
