import { formatOperationalDateTime } from '../common/operational-time';
import { MAX_EXPORT_BYTES, CsvSizeLimitError } from './export-limits';
import { serializeCsv } from './csv';

describe('serializeCsv', () => {
  it('writes a UTF-8 BOM, semicolon fields, CRLF and formula-safe text', () => {
    const csv = serializeCsv(
      ['valor', 'data'],
      [
        ['=1+1', null],
        ['+cmd', 12],
        ['-cmd', new Date('2026-08-22T12:00:00.000Z')],
        ['@cmd', undefined],
        ['\tcmd', 'a;b'],
        ['\rcmd', 'a"b'],
        ['a\r\nb', 'normal'],
      ],
    ).toString('utf8');

    expect(csv).toBe(
      `\ufeffvalor;data\r\n'=1+1;\r\n'+cmd;12\r\n'-cmd;${formatOperationalDateTime(
        new Date('2026-08-22T12:00:00.000Z'),
      )}\r\n'@cmd;\r\n'\tcmd;"a;b"\r\n"'\rcmd";"a""b"\r\n"a\r\nb";normal\r\n`,
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).not.toMatch(/(^|[^\r])\n/);
  });

  it('accepts exactly the configured byte boundary and rejects the next byte', () => {
    const fixedBytes = Buffer.byteLength('\ufeffa\r\n\r\n', 'utf8');
    const exact = 'x'.repeat(MAX_EXPORT_BYTES - fixedBytes);

    expect(serializeCsv(['a'], [[exact]], MAX_EXPORT_BYTES)).toHaveLength(
      MAX_EXPORT_BYTES,
    );
    expect(() =>
      serializeCsv(['a'], [[`${exact}x`]], MAX_EXPORT_BYTES),
    ).toThrow(CsvSizeLimitError);
  });

  it('reports the configured limit for an oversized row', () => {
    expect(() => serializeCsv(['a'], [['x'.repeat(100)]], 20)).toThrow(
      CsvSizeLimitError,
    );
  });
});
