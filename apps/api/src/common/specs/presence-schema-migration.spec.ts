import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
  __dirname,
  '..',
  '..',
  '..',
  'prisma',
  'migrations',
  '20260821120000_add_sessions_daily_presence',
  'migration.sql',
);

describe('presence schema migration contract', () => {
  let sql: string;

  beforeAll(() => {
    sql = readFileSync(migrationPath, 'utf8');
  });

  it('creates only session and daily summary persistence', () => {
    expect(sql).toContain('CREATE TABLE "UserSession"');
    expect(sql).toContain('CREATE TABLE "PresenceDailySummary"');
    expect(sql).not.toContain('PresenceSample');
    expect(sql).toContain('PRIMARY KEY ("operationalDate")');
    expect(sql).toContain('ON DELETE RESTRICT');
  });

  it('does not duplicate the session id as a jti column', () => {
    expect(sql).not.toMatch(/"jti"/);
    expect(sql).toContain('PRIMARY KEY ("id")');
  });
});
