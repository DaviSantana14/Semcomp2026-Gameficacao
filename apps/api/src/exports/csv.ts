import { formatOperationalDateTime } from '../common/operational-time';
import { CsvSizeLimitError, MAX_EXPORT_BYTES } from './export-limits';

export type CsvValue = string | number | boolean | Date | null | undefined;

export function serializeCsv(
  header: readonly CsvValue[],
  rows: readonly (readonly CsvValue[])[],
  maxBytes = MAX_EXPORT_BYTES,
): Buffer {
  const chunks: Buffer[] = [];
  let byteCount = 0;

  for (const row of [header, ...rows]) {
    const line = Buffer.from(
      `${row.map(escapeCsvField).join(';')}\r\n`,
      'utf8',
    );
    const prefix = chunks.length === 0 ? Buffer.from('\ufeff', 'utf8') : null;
    const nextByteCount = byteCount + (prefix?.length ?? 0) + line.length;
    if (nextByteCount > maxBytes) {
      throw new CsvSizeLimitError(nextByteCount, maxBytes);
    }
    if (prefix) chunks.push(prefix);
    chunks.push(line);
    byteCount = nextByteCount;
  }

  return Buffer.concat(chunks, byteCount);
}

export function escapeCsvField(value: CsvValue): string {
  const text =
    value instanceof Date
      ? formatOperationalDateTime(value)
      : value === null || value === undefined
        ? ''
        : String(value);
  const formulaSafe =
    typeof value === 'string' && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;

  if (/[;"\r\n]/.test(formulaSafe)) {
    return `"${formulaSafe.replace(/"/g, '""')}"`;
  }
  return formulaSafe;
}
