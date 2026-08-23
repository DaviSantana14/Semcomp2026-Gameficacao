import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export type DownloadKind = 'qr';

const activeDownloads = new Set<DownloadKind>();

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
    if (activeDownloads.has(kind)) {
      throw new DownloadCapacityError();
    }

    activeDownloads.add(kind);
    try {
      return await work();
    } finally {
      activeDownloads.delete(kind);
    }
  }
}
