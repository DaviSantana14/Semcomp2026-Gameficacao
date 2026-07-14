import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Marco 10 audit persistence migration', () => {
  const migrationPath = join(
    process.cwd(),
    'prisma/migrations/20260714120000_add_audit_and_reconciliation/migration.sql',
  );
  const sql = readFileSync(migrationPath, 'utf8');

  it('wraps the complete PostgreSQL migration in one transaction', () => {
    const statements = sql.trim();

    expect(statements).toMatch(/^BEGIN;\s/i);
    expect(statements).toMatch(/\sCOMMIT;$/i);
    expect(statements.indexOf('BEGIN;')).toBeLessThan(
      statements.indexOf('CREATE TYPE "AuditActorType"'),
    );
    expect(statements.lastIndexOf('COMMIT;')).toBeGreaterThan(
      statements.indexOf('AdminAuditEvent_append_only'),
    );
  });

  it('backfills XP only for provable action redemptions before constraints', () => {
    expect(sql).toContain(
      'SET "xpDelta" = CASE WHEN "source" = \'ACTION_REDEEM\' THEN "points" ELSE 0 END',
    );
    expect(sql).not.toMatch(/description.*RewardRedemption/is);
    expect(sql.indexOf('SET "xpDelta"')).toBeLessThan(
      sql.indexOf('PointEvent_credit_points_check'),
    );
  });

  it('enforces actor, point direction, idempotency, and one reversal', () => {
    expect(sql).toContain('AdminAuditEvent_actor_check');
    expect(sql).toContain('PointEvent_credit_points_check');
    expect(sql).toContain('PointEvent_debit_points_check');
    expect(sql).toContain('PointEvent_idempotencyKey_key');
    expect(sql).toContain('PointEvent_reversedEventId_key');
  });

  it('replaces historical foreign keys with restrictive relations', () => {
    expect(sql).toContain('PointEvent_userId_fkey');
    expect(sql).toContain('RewardRedemption_userId_fkey');
    expect(sql.match(/ON DELETE RESTRICT/g)?.length).toBeGreaterThanOrEqual(8);
  });

  it('installs append-only protection last for both ledgers', () => {
    const triggerFunction = sql.indexOf('reject_immutable_ledger_change');
    expect(triggerFunction).toBeGreaterThan(
      sql.indexOf('PointEvent_reversedEventId_fkey'),
    );
    expect(sql).toContain('PointEvent_append_only');
    expect(sql).toContain('AdminAuditEvent_append_only');
    expect(sql).toContain('immutable ledger');
    expect(sql).toContain('BEFORE UPDATE OR DELETE');
  });
});
