import { ClaimCodeBulkOutcome } from './claim-code-bulk-outcome';

export type ClaimCodeBulkCsvItem = {
  requestedClaimCodeId: string;
  maskedCode: string | null;
  outcome: ClaimCodeBulkOutcome;
};

const HEADER = ['codigo_id', 'codigo_mascarado', 'resultado'];

export function serializeClaimCodeBulkCsv(items: ClaimCodeBulkCsvItem[]) {
  const rows = [
    HEADER,
    ...[...items]
      .sort((first, second) =>
        first.requestedClaimCodeId.localeCompare(second.requestedClaimCodeId),
      )
      .map((item) => [
        item.requestedClaimCodeId,
        item.maskedCode,
        item.outcome,
      ]),
  ];

  return `\ufeff${rows
    .map((row) => row.map(escapeClaimCodeBulkCsvField).join(';'))
    .join('\r\n')}\r\n`;
}

function escapeClaimCodeBulkCsvField(value: string | null | undefined) {
  const text = value == null ? '' : String(value);
  const formulaSafe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  if (/[;"\r\n]/.test(formulaSafe)) {
    return `"${formulaSafe.replace(/"/g, '""')}"`;
  }
  return formulaSafe;
}
