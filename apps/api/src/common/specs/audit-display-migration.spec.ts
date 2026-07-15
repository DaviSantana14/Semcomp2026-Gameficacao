import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('audit display snapshot migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20260715120000_add_audit_display_snapshots/migration.sql',
    ),
    'utf8',
  );

  it('fills missing snapshots for legacy inserts before append-only protection', () => {
    expect(sql).toContain('CREATE FUNCTION fill_audit_display_snapshots()');
    expect(sql).toContain('BEFORE INSERT ON "AdminAuditEvent"');
    expect(sql).toContain('NEW."actorDisplayName" IS NULL');
    expect(sql).toContain('NEW."entityDisplayName" IS NULL');
    expect(sql).toContain('RETURN NEW;');
    expect(sql.indexOf('fill_audit_display_snapshots')).toBeLessThan(
      sql.lastIndexOf('COMMIT;'),
    );
  });

  it('uses only safe relations and canonical masks of at most 100 characters', () => {
    expect(sql).toContain(
      `char_length(COALESCE(NEW."after"->>'maskedCode', NEW."before"->>'maskedCode')) <= 100`,
    );
    expect(sql).toContain(
      `char_length(COALESCE(audit."after"->>'maskedCode', audit."before"->>'maskedCode')) <= 100`,
    );
    expect(sql).not.toMatch(/SELECT[^;]+"cpf"/is);
    expect(sql).not.toMatch(/FROM\s+"ClaimCode"/i);
  });
});
