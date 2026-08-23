import {
  ClaimCodeBulkCsvItem,
  serializeClaimCodeBulkCsv,
} from '../claim-code-bulk-csv';
import { ClaimCodeBulkOutcome } from '../claim-code-bulk-outcome';

describe('serializeClaimCodeBulkCsv', () => {
  it('writes a sorted, masked, BOM-prefixed CRLF report', () => {
    const items: ClaimCodeBulkCsvItem[] = [
      {
        requestedClaimCodeId: 'code-2',
        maskedCode: null,
        outcome: ClaimCodeBulkOutcome.NOT_FOUND,
      },
      {
        requestedClaimCodeId: 'code-1',
        maskedCode: 'AB*****GH',
        outcome: ClaimCodeBulkOutcome.CHANGED,
      },
    ];

    const csv = serializeClaimCodeBulkCsv(items);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toBe(
      '\ufeffcodigo_id;codigo_mascarado;resultado\r\n' +
        'code-1;AB*****GH;CHANGED\r\n' +
        'code-2;;NOT_FOUND\r\n',
    );
    expect(csv).not.toContain('ABCD-EFGH');
    expect(csv).not.toMatch(/(^|[^\r])\n/);
  });

  it('escapes report fields without introducing raw values', () => {
    const csv = serializeClaimCodeBulkCsv([
      {
        requestedClaimCodeId: 'code;"2',
        maskedCode: 'AB*****GH',
        outcome: ClaimCodeBulkOutcome.ALREADY_IN_STATE,
      },
    ]);

    expect(csv).toContain('"code;""2";AB*****GH;ALREADY_IN_STATE\r\n');
  });

  it('defends report text beginning with tab or carriage return', () => {
    const csv = serializeClaimCodeBulkCsv([
      {
        requestedClaimCodeId: '\t=1+1',
        maskedCode: '\r@unsafe',
        outcome: ClaimCodeBulkOutcome.NOT_FOUND,
      },
    ]);

    expect(csv).toContain('\'\t=1+1;"\'\r@unsafe";NOT_FOUND\r\n');
  });
});
