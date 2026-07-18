import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { buildDatabaseUrl } from '../src/prisma/database-url';
import { assertDisposableTestDatabase } from './support/e2e-database-cleanup';

const marco10Migration = '20260714120000_add_audit_and_reconciliation';

describe('Marco 10 migration (e2e)', () => {
  let client: Client;
  let schema: string;

  beforeAll(async () => {
    assertDisposableTestDatabase();
    schema = process.env.DB_SCHEMA ?? '';
    if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) {
      throw new Error('DB_SCHEMA must be a simple PostgreSQL identifier.');
    }
    client = new Client({ connectionString: buildDatabaseUrl() });
    await client.connect();
  });

  afterAll(async () => {
    if (client) await client.end();
  });

  it('applies all migrations to an empty database', async () => {
    await resetSchema();
    await applyMigrations();

    const result = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 AND table_name IN ('AdminAuditEvent', 'PointEvent')
       ORDER BY table_name`,
      [schema],
    );
    expect(result.rows.map(({ table_name }) => table_name)).toEqual([
      'AdminAuditEvent',
      'PointEvent',
    ]);
  });

  it('preserves legacy events and only backfills provable XP', async () => {
    await resetSchema();
    await applyMigrations((name) => name < marco10Migration);
    await createLegacyFixtures();
    await applyMigration(marco10Migration);

    const result = await client.query<{
      id: string;
      xpDelta: number;
      auditEventId: string | null;
      rewardRedemptionId: string | null;
      actorAdminId: string | null;
    }>(
      `SELECT "id", "xpDelta", "auditEventId", "rewardRedemptionId", "actorAdminId"
       FROM "PointEvent" ORDER BY "id"`,
    );
    expect(result.rows).toEqual([
      {
        id: 'event-action',
        xpDelta: 10,
        auditEventId: null,
        rewardRedemptionId: null,
        actorAdminId: null,
      },
      {
        id: 'event-reward',
        xpDelta: 0,
        auditEventId: null,
        rewardRedemptionId: null,
        actorAdminId: null,
      },
    ]);
  });

  async function resetSchema() {
    await client.query(
      `DROP SCHEMA IF EXISTS "${schema}" CASCADE; CREATE SCHEMA "${schema}"; SET search_path TO "${schema}"`,
    );
  }

  async function applyMigrations(
    predicate: (name: string) => boolean = () => true,
  ) {
    const migrationsPath = join(process.cwd(), 'prisma', 'migrations');
    const migrations = readdirSync(migrationsPath)
      .filter((name) => /^\d+_/.test(name) && predicate(name))
      .sort();
    for (const migration of migrations) await applyMigration(migration);
  }

  async function applyMigration(name: string) {
    const sql = readFileSync(
      join(process.cwd(), 'prisma', 'migrations', name, 'migration.sql'),
      'utf8',
    );
    await client.query(sql);
  }

  async function createLegacyFixtures() {
    await client.query(`
      INSERT INTO "User" ("id", "name", "cpf", "email", "updatedAt")
      VALUES ('participant', 'Legacy participant', '12345678901', 'legacy@example.test', CURRENT_TIMESTAMP);
      INSERT INTO "Action" ("id", "name", "type", "points", "updatedAt")
      VALUES ('action', 'Legacy action', 'CHECKIN', 10, CURRENT_TIMESTAMP);
      INSERT INTO "Reward" ("id", "name", "costInPoints", "stock", "updatedAt")
      VALUES ('reward', 'Legacy reward', 3, 1, CURRENT_TIMESTAMP);
      INSERT INTO "RewardRedemption" ("id", "userId", "rewardId", "pointsSpent", "updatedAt")
      VALUES ('redemption', 'participant', 'reward', 3, CURRENT_TIMESTAMP);
      INSERT INTO "PointEvent"
        ("id", "userId", "actionId", "points", "kind", "source", "redemptionMethod", "description")
      VALUES
        ('event-action', 'participant', 'action', 10, 'CREDIT', 'ACTION_REDEEM', 'LEGACY_UNKNOWN', 'Legacy action'),
        ('event-reward', 'participant', NULL, -3, 'DEBIT', 'REWARD_REDEMPTION', NULL, 'Legacy reward redemption redemption');
    `);
  }
});
