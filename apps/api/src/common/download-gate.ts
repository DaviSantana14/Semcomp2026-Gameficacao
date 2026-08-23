import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export type DownloadKind = 'qr' | 'csv';

const DOWNLOAD_CAPACITY: Record<DownloadKind, number> = {
  qr: 1,
  csv: 2,
};
const activeDownloads = new Map<DownloadKind, number>();

export class DownloadCapacityError extends HttpException {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds = 30) {
    super(
      'A geração de artefatos está ocupada. Tente novamente em breve.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
    this.name = DownloadCapacityError.name;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

@Injectable()
export class DownloadGate {
  async run<T>(kind: DownloadKind, work: () => T | PromiseLike<T>): Promise<T> {
    const active = activeDownloads.get(kind) ?? 0;
    if (active >= DOWNLOAD_CAPACITY[kind]) {
      throw new DownloadCapacityError();
    }

    activeDownloads.set(kind, active + 1);
    try {
      return await work();
    } finally {
      const remaining = (activeDownloads.get(kind) ?? 1) - 1;
      if (remaining > 0) {
        activeDownloads.set(kind, remaining);
      } else {
        activeDownloads.delete(kind);
      }
    }
  }
}
