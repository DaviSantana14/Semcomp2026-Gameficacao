import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { DownloadCapacityError, DownloadGate } from '../common/download-gate';

export const EXPORT_BATCH_SIZE = 1_000;
export const MAX_EXPORT_ROWS = 50_000;
export const MAX_EXPORT_BYTES = 25 * 1024 * 1024;
export const EXPORT_RETRY_AFTER_SECONDS = 30;

export class CsvRowLimitError extends HttpException {
  readonly rowCount: number;
  readonly limit: number;

  constructor(rowCount: number, limit = MAX_EXPORT_ROWS) {
    super(
      {
        message: `A exportação CSV contém ${rowCount} registros; o limite é ${limit}.`,
        rowCount,
        limit,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
    this.name = CsvRowLimitError.name;
    this.rowCount = rowCount;
    this.limit = limit;
  }
}

export class CsvSizeLimitError extends HttpException {
  readonly byteCount: number;
  readonly limit: number;

  constructor(byteCount: number, limit = MAX_EXPORT_BYTES) {
    super(
      {
        message: `A exportação CSV excede o limite de ${limit} bytes.`,
        byteCount,
        limit,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
    this.name = CsvSizeLimitError.name;
    this.byteCount = byteCount;
    this.limit = limit;
  }
}

@Injectable()
export class ExportLimits {
  constructor(private readonly gate: DownloadGate = new DownloadGate()) {}

  runCsv<T>(work: () => T | PromiseLike<T>): Promise<T> {
    return this.gate.run('csv', work).catch((error: unknown) => {
      if (error instanceof DownloadCapacityError) {
        throw new DownloadCapacityError(EXPORT_RETRY_AFTER_SECONDS);
      }
      throw error;
    });
  }

  assertRowCount(rowCount: number, limit = MAX_EXPORT_ROWS) {
    if (rowCount > limit) {
      throw new CsvRowLimitError(rowCount, limit);
    }
  }
}
