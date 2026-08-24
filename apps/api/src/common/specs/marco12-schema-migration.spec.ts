import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Marco 12 schema migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'prisma/migrations/20260822120000_add_marco12_scale_exports_qr/migration.sql',
    ),
    'utf8',
  );

  it('creates the batch, bulk operation and security metric tables', () => {
    expect(sql).toContain('CREATE TABLE "ClaimCodeBatch"');
    expect(sql).toContain('CREATE TABLE "ClaimCodeBulkOperation"');
    expect(sql).toContain('CREATE TABLE "ClaimCodeBulkOperationItem"');
    expect(sql).toContain('CREATE TABLE "SecurityHttpMetricMinute"');
    expect(sql).toContain('CREATE TYPE "ClaimCodeBulkOutcome"');
  });

  it('keeps the legacy claim-code rows nullable without backfilling a batch', () => {
    expect(sql).toContain('ADD COLUMN "batchId" TEXT');
    expect(sql).not.toMatch(/UPDATE "ClaimCode" SET "batchId"/);
  });

  it('protects bulk operation records as append-only ledgers', () => {
    expect(sql).toContain('ClaimCodeBulkOperation_append_only');
    expect(sql).toContain('ClaimCodeBulkOperationItem_append_only');
    expect(sql).toContain('BEFORE UPDATE OR DELETE');
  });

  it('enforces the bounded bulk report counts', () => {
    expect(sql).toContain('ClaimCodeBulkOperation_counts_check');
    expect(sql).toContain('"selectedCount" BETWEEN 1 AND 500');
    expect(sql).toContain(
      '"changedCount" + "unchangedCount" + "usedCount" + "notFoundCount" = "selectedCount"',
    );
  });

  it('adds the bulk audit operation and entity enum values transactionally', () => {
    expect(sql.trimStart().startsWith('BEGIN;')).toBe(true);
    expect(sql.trimEnd().endsWith('COMMIT;')).toBe(true);
    expect(sql).toMatch(
      /ALTER TYPE "AuditOperation"\s+ADD VALUE 'CLAIM_CODE_BULK_STATUS_CHANGED'/,
    );
    expect(sql).toMatch(
      /ALTER TYPE "AuditEntityType"\s+ADD VALUE 'CLAIM_CODE_BULK_OPERATION'/,
    );
  });

  it('uses restrictive foreign keys for every new relational link', () => {
    const foreignKeys = sql.match(/ON DELETE RESTRICT/g) ?? [];
    expect(foreignKeys.length).toBe(6);
    expect(sql).toContain('ClaimCodeBatch_actionId_fkey');
    expect(sql).toContain('ClaimCodeBatch_createdByAdminId_fkey');
    expect(sql).toContain('ClaimCode_batchId_fkey');
    expect(sql).toContain('ClaimCodeBulkOperation_actorAdminId_fkey');
    expect(sql).toContain('ClaimCodeBulkOperationItem_operationId_fkey');
    expect(sql).toContain('ClaimCodeBulkOperationItem_claimCodeId_fkey');
  });
});
