import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function findFiles(root: string, suffix: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory()
      ? findFiles(path, suffix)
      : path.endsWith(suffix)
        ? [path]
        : [];
  });
}

describe('repository architecture boundaries', () => {
  const sourceRoot = join(__dirname, '..', '..');

  it('keeps Prisma and transaction clients out of services', () => {
    for (const path of findFiles(sourceRoot, '.service.ts').filter(
      (path) => !path.endsWith('prisma.service.ts'),
    )) {
      const source = readFileSync(path, 'utf8');
      expect(source).not.toMatch(
        /PrismaService|TransactionClient|repository\.db|@prisma\/client|\$transaction/,
      );
    }
  });

  it('keeps HTTP concerns, DTOs and response serialization out of repositories', () => {
    for (const path of findFiles(sourceRoot, '.repository.ts')) {
      const source = readFileSync(path, 'utf8');
      expect(source).not.toMatch(
        /(?:BadRequest|Conflict|Forbidden|NotFound|Unauthorized)Exception|from ['"].*\/dto\/|toISOString\(/,
      );
    }
  });

  it('does not expose the Prisma redemption enum through the audit repository', () => {
    const source = readFileSync(
      join(sourceRoot, 'audit', 'audit.repository.ts'),
      'utf8',
    );
    expect(source).not.toMatch(
      /export\s*\{[^}]*ActionRedemptionMethod[^}]*\}/s,
    );
  });
});
