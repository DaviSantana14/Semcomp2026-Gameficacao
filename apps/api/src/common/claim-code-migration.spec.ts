import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('claim code audit migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20260711180000_add_admin_management_fields/migration.sql',
    ),
    'utf8',
  );

  it('validates used claim codes before backfilling their point event', () => {
    expect(sql.indexOf('RAISE EXCEPTION')).toBeGreaterThan(-1);
    expect(sql.indexOf('RAISE EXCEPTION')).toBeLessThan(
      sql.indexOf('SET "claimCodeId"'),
    );
    expect(sql).toContain('HAVING COUNT(pe."id") <> 1');
  });

  it('marks linked and ambiguous legacy action redemptions accurately', () => {
    expect(sql).toContain('"redemptionMethod" = \'CLAIM_CODE\'');
    expect(sql).toContain('SET "redemptionMethod" = \'LEGACY_UNKNOWN\'');
  });

  it('adds relational and consistency constraints after the backfill', () => {
    expect(sql.indexOf('SET "redemptionMethod" = \'LEGACY_UNKNOWN\'')).toBeLessThan(
      sql.indexOf('PointEvent_claimCodeId_fkey'),
    );
    expect(sql).toContain('ClaimCode_used_not_active_check');
    expect(sql).toContain('PointEvent_action_redemption_method_check');
    expect(sql).toContain('PointEvent_claim_code_method_check');
  });
});
