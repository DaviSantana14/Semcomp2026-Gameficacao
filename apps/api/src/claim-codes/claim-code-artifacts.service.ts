import { BadRequestException, Injectable } from '@nestjs/common';
import archiver from 'archiver';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import type { Writable } from 'node:stream';
import { DownloadGate } from '../common/download-gate';
import {
  MAX_QR_CARDS,
  renderQrCardPng,
  sanitizeQrFileName,
  type QrCard,
} from './claim-code-qr';

export type QrPdfMetadata = {
  actionName: string;
  batchId: string | null;
  generatedAt?: Date | string;
};

type BeforeWrite = () => void;
type QrCardRenderer = (card: QrCard) => Promise<Buffer>;

type Destroyable = {
  on(event: string, listener: (...args: never[]) => void): unknown;
  once(event: string, listener: (...args: never[]) => void): unknown;
  removeListener(event: string, listener: (...args: never[]) => void): unknown;
  destroy(error?: Error): unknown;
};

function assertQrCardLimit(cards: QrCard[]) {
  if (cards.length > MAX_QR_CARDS) {
    throw new BadRequestException(
      `A exportação QR aceita no máximo ${MAX_QR_CARDS} cartões.`,
    );
  }
}

function orderedCards(cards: QrCard[]) {
  return [...cards]
    .sort((left, right) =>
      left.code < right.code ? -1 : left.code > right.code ? 1 : 0,
    )
    .map((card, index) => ({ ...card, sequence: index + 1 }));
}

function csvField(value: string) {
  const safeValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replace(/"/g, '""')}"`;
}

function serializeManifest(cards: QrCard[]) {
  const lines = [
    ['sequencia', 'codigo', 'atividade', 'lote', 'tipo']
      .map(csvField)
      .join(';'),
    ...cards.map((card, index) =>
      [
        String(index + 1),
        card.code,
        card.actionName,
        card.batchId ?? '',
        card.kind,
      ]
        .map(csvField)
        .join(';'),
    ),
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function monitorOutput(output: Writable, source: Destroyable) {
  let settled = false;
  let failure: Error | undefined;
  let resolvePromise!: () => void;
  let rejectPromise!: (error: Error) => void;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  const cleanup = () => {
    output.removeListener('finish', onFinish);
    output.removeListener('error', onError);
    output.removeListener('close', onClose);
    source.removeListener('error', onError);
  };
  const finish = () => {
    if (settled) return;
    settled = true;
    cleanup();
    resolvePromise();
  };
  const fail = (error: unknown) => {
    if (settled) return;
    failure = error instanceof Error ? error : new Error(String(error));
    settled = true;
    cleanup();
    rejectPromise(failure);
  };
  const onFinish = () => finish();
  const onError = (error: Error) => fail(error);
  const onClose = () => {
    if (!output.writableFinished) {
      fail(new Error('O stream do artefato foi encerrado antes da conclusão.'));
      source.destroy();
    }
  };

  output.once('finish', onFinish);
  output.once('error', onError);
  output.once('close', onClose);
  source.once('error', onError);

  return {
    promise,
    throwIfAborted() {
      if (failure) throw failure;
    },
    abort(error: unknown) {
      fail(error);
      source.destroy(error instanceof Error ? error : undefined);
      if (!output.destroyed) output.destroy();
    },
  };
}

function beginPage(doc: PDFKit.PDFDocument, metadata: QrPdfMetadata) {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = (12 / 25.4) * 72;
  const generatedAt = metadata.generatedAt
    ? new Date(metadata.generatedAt).toISOString()
    : new Date().toISOString();
  const batchLabel = metadata.batchId ?? 'reutilizável';
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#4b5563')
    .text(
      `${metadata.actionName} · ${batchLabel} · ${generatedAt}`,
      margin,
      margin,
      { width: pageWidth - margin * 2, height: 14, lineBreak: false },
    );
  return {
    margin,
    gridTop: margin + 28,
    cellWidth: (pageWidth - margin * 2 - 6) / 2,
    cellHeight: (pageHeight - (margin + 28) - margin - 18) / 4,
    gap: 6,
  };
}

export async function writeQrPdf(
  output: Writable,
  cards: QrCard[],
  metadata: QrPdfMetadata,
  renderCard: QrCardRenderer = renderQrCardPng,
) {
  assertQrCardLimit(cards);
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const lifecycle = monitorOutput(output, doc);
  doc.pipe(output);

  try {
    let layout = beginPage(doc, metadata);
    for (const [index, card] of cards.entries()) {
      lifecycle.throwIfAborted();
      if (index > 0 && index % 8 === 0) {
        doc.addPage({ size: 'A4', margin: 0 });
        layout = beginPage(doc, metadata);
      }
      const png = await renderCard(card);
      lifecycle.throwIfAborted();
      const row = (index % 8) % 4;
      const column = Math.floor((index % 8) / 4);
      const x = layout.margin + column * (layout.cellWidth + layout.gap);
      const y = layout.gridTop + row * (layout.cellHeight + layout.gap);
      const scale = Math.min(layout.cellWidth / 1200, layout.cellHeight / 1500);
      const width = 1200 * scale;
      const height = 1500 * scale;
      const pdfPng = await sharp(png)
        .resize({
          width: Math.max(1, Math.round(width)),
          height: Math.max(1, Math.round(height)),
          fit: 'fill',
        })
        .png()
        .toBuffer();
      doc.image(pdfPng, x + (layout.cellWidth - width) / 2, y, {
        width,
        height,
      });
    }
    doc.end();
    await lifecycle.promise;
  } catch (error) {
    lifecycle.abort(error);
    throw error;
  }
}

export async function writeQrZip(
  output: Writable,
  cards: QrCard[],
  renderCard: QrCardRenderer = renderQrCardPng,
) {
  assertQrCardLimit(cards);
  const sortedCards = orderedCards(cards);
  const archive = archiver('zip', { zlib: { level: 9 } });
  const lifecycle = monitorOutput(output, archive);
  archive.pipe(output);

  try {
    for (const card of sortedCards) {
      lifecycle.throwIfAborted();
      const png = await renderCard(card);
      lifecycle.throwIfAborted();
      archive.append(png, {
        name: `${String(card.sequence).padStart(3, '0')}-${sanitizeQrFileName(card.code)}.png`,
      });
    }
    archive.append(Buffer.from(serializeManifest(sortedCards), 'utf8'), {
      name: 'manifesto.csv',
    });
    await archive.finalize();
    await lifecycle.promise;
  } catch (error) {
    lifecycle.abort(error);
    throw error;
  }
}

async function endWithBuffer(output: Writable, buffer: Buffer) {
  await new Promise<void>((resolve, reject) => {
    const onFinish = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => {
      if (!output.writableFinished) {
        cleanup();
        reject(
          new Error('O stream do artefato foi encerrado antes da conclusão.'),
        );
      }
    };
    const cleanup = () => {
      output.removeListener('finish', onFinish);
      output.removeListener('error', onError);
      output.removeListener('close', onClose);
    };
    output.once('finish', onFinish);
    output.once('error', onError);
    output.once('close', onClose);
    output.end(buffer);
  });
}

export async function writeQrPng(output: Writable, card: QrCard) {
  await endWithBuffer(output, await renderQrCardPng(card));
}

@Injectable()
export class ClaimCodeArtifactsService {
  constructor(private readonly gate: DownloadGate = new DownloadGate()) {}

  runQr<T>(work: () => T | PromiseLike<T>) {
    return this.gate.run('qr', work);
  }

  writeQrPng(output: Writable, card: QrCard, beforeWrite?: BeforeWrite) {
    return this.gate.run('qr', async () => {
      beforeWrite?.();
      return writeQrPng(output, card);
    });
  }

  writeQrPdf(
    output: Writable,
    cards: QrCard[],
    metadata: QrPdfMetadata,
    beforeWrite?: BeforeWrite,
  ) {
    assertQrCardLimit(cards);
    return this.gate.run('qr', async () => {
      beforeWrite?.();
      return writeQrPdf(output, cards, metadata);
    });
  }

  writeQrZip(output: Writable, cards: QrCard[], beforeWrite?: BeforeWrite) {
    assertQrCardLimit(cards);
    return this.gate.run('qr', async () => {
      beforeWrite?.();
      return writeQrZip(output, cards);
    });
  }
}
