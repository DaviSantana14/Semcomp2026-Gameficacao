import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function readIfPresent(path: string) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

describe('Marco 13 schema migration contract', () => {
  const schema = readIfPresent(
    join(__dirname, '..', '..', '..', 'prisma', 'schema', 'users.prisma'),
  );
  const migration = readIfPresent(
    join(
      __dirname,
      '..',
      '..',
      '..',
      'prisma',
      'migrations',
      '20260823120000_add_marco13_admin_profiles',
      'migration.sql',
    ),
  );

  it('defines the three administrative profiles and reset state', () => {
    expect(schema).toContain('enum AdminProfile');
    expect(schema).toContain('GENERAL');
    expect(schema).toContain('SHOP');
    expect(schema).toContain('ACTIVITIES');
    expect(schema).toContain('model AdminActivation');
    expect(schema).toContain('adminProfile');
    expect(schema).toContain('passwordResetRequired');
    expect(schema).toContain('passwordResetExpiresAt');
    expect(schema).not.toContain('enum AdminAccountStatus');
  });

  it('stores only activation hashes with restrictive relational checks', () => {
    expect(schema).toContain('codeHash         String');
    expect(schema).not.toMatch(/\bcode\s+String/);
    expect(migration).toContain('User_admin_profile_check');
    expect(migration).toContain('User_participant_reset_state_check');
    expect(migration).toContain('UPDATE "User"');
    expect(migration).toContain('WHERE "role" = \'ADMIN\'::"UserRole"');
    expect(migration).toContain('\'GENERAL\'::"AdminProfile"');
    expect(migration).toContain('CREATE TABLE "AdminActivation"');
    expect(migration).toContain('"codeHash" TEXT NOT NULL');
    expect(migration).toContain('AdminActivation_adminUserId_fkey');
    expect(migration).toContain('AdminActivation_createdByAdminId_fkey');
    expect(migration.match(/ON DELETE RESTRICT/g)).toHaveLength(2);
  });
});
