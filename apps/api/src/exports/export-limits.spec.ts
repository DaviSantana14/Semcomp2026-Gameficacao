import { DownloadGate, DownloadCapacityError } from '../common/download-gate';
import {
  EXPORT_BATCH_SIZE,
  ExportLimits,
  MAX_EXPORT_BYTES,
  MAX_EXPORT_ROWS,
  CsvRowLimitError,
} from './export-limits';

describe(ExportLimits.name, () => {
  it('allows two CSV generations and rejects a third with a 30-second retry', async () => {
    const limits = new ExportLimits(new DownloadGate());
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const first = limits.runCsv(
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        }),
    );
    const second = limits.runCsv(
      () =>
        new Promise<void>((resolve) => {
          releaseSecond = resolve;
        }),
    );

    await expect(limits.runCsv(() => 'third')).rejects.toEqual(
      expect.objectContaining<Partial<DownloadCapacityError>>({
        retryAfterSeconds: 30,
      }),
    );

    releaseFirst();
    releaseSecond();
    await Promise.all([first, second]);
    await expect(limits.runCsv(() => 'available')).resolves.toBe('available');
  });

  it('publishes the bounded export constants', () => {
    expect(EXPORT_BATCH_SIZE).toBe(1000);
    expect(MAX_EXPORT_ROWS).toBe(50_000);
    expect(MAX_EXPORT_BYTES).toBe(25 * 1024 * 1024);
  });

  it('rejects a known row count before fetching export blocks', () => {
    expect(() =>
      new ExportLimits().assertRowCount(MAX_EXPORT_ROWS + 1),
    ).toThrow(CsvRowLimitError);
  });
});
