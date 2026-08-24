import { compare } from 'bcrypt';
import { buildAdminSeedUser } from '../../prisma/seed-admin';

describe('buildAdminSeedUser', () => {
  const admin = {
    name: 'Administração Semcomp',
    cpf: '52998224725',
    email: 'admin@semcomp.dev',
  };

  it('hashes the local demo admin password', async () => {
    const user = await buildAdminSeedUser({
      mode: 'demo',
      admin: { ...admin, password: 'local-demo-password' },
    });

    expect(user.passwordHash).toEqual(expect.any(String));
    await expect(
      compare('local-demo-password', user.passwordHash!),
    ).resolves.toBe(true);
  });

  it('does not add a password to the admin-only seed', async () => {
    const user = await buildAdminSeedUser({ mode: 'admin-only', admin });

    expect(user).not.toHaveProperty('passwordHash');
  });
});
