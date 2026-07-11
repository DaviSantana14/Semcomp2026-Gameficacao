import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('claim-code migration', () => {
  it('reserves the claim-code namespace case-insensitively for Action.code', () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        'prisma',
        'migrations',
        '20260711120000_add_claim_codes',
        'migration.sql',
      ),
      'utf8',
    );
    const actionNamespaceChecks = migration.match(
      /UPPER\("code"\)\s*!?~\s*'\^\[A-HJ-NP-Z2-9]\{4\}-\[A-HJ-NP-Z2-9]\{4\}\$'/g,
    );

    expect(actionNamespaceChecks).toHaveLength(2);
  });
});
