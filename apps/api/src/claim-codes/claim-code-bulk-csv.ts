import { ClaimCodeBulkOutcome } from './claim-code-bulk-outcome';
import { serializeCsv } from '../exports/csv';

export type ClaimCodeBulkCsvItem = {
  requestedClaimCodeId: string;
  maskedCode: string | null;
  outcome: ClaimCodeBulkOutcome;
};

const HEADER = ['codigo_id', 'codigo_mascarado', 'resultado'];

export function serializeClaimCodeBulkCsv(items: ClaimCodeBulkCsvItem[]) {
  const rows = [...items]
    .sort((first, second) =>
      first.requestedClaimCodeId.localeCompare(second.requestedClaimCodeId),
    )
    .map((item) => [item.requestedClaimCodeId, item.maskedCode, item.outcome]);

  return serializeCsv(HEADER, rows).toString('utf8');
}
