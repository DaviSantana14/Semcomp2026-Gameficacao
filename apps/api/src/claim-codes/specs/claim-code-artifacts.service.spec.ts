import { PassThrough } from 'node:stream';
import { PDFDocument } from 'pdf-lib';
import yauzl from 'yauzl-promise';
import { BadRequestException } from '@nestjs/common';
import { MAX_QR_CARDS, type QrCard } from '../claim-code-qr';
import {
  writeQrPdf,
  writeQrZip,
  type QrPdfMetadata,
} from '../claim-code-artifacts.service';

jest.setTimeout(60_000);

function collect(stream: PassThrough) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.once('error', reject);
    stream.once('end', () => resolve(Buffer.concat(chunks)));
  });
}

function card(sequence: number, code: string): QrCard {
  return {
    sequence,
    code,
    actionName: 'Credenciamento',
    kind: 'Uso único',
    batchId: 'batch-1',
  };
}

const metadata: QrPdfMetadata = {
  actionName: 'Credenciamento',
  batchId: 'batch-1',
  generatedAt: new Date('2026-08-22T12:00:00.000Z'),
};

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const renderTinyPng = () => Promise.resolve(tinyPng);

describe('claim-code artifact writers', () => {
  it.each([
    [1, 1],
    [8, 1],
    [9, 2],
  ])(
    'writes an A4 PDF with eight cards per page (%i cards)',
    async (count, pages) => {
      const output = new PassThrough();
      const bytesPromise = collect(output);
      const cards = Array.from({ length: count }, (_, index) =>
        card(index + 1, `CODE-${String(index + 1).padStart(4, '0')}`),
      );

      await writeQrPdf(output, cards, metadata, renderTinyPng);
      const pdf = await PDFDocument.load(await bytesPromise);

      expect(pdf.getPageCount()).toBe(pages);
      expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28, 1);
      expect(pdf.getPage(0).getHeight()).toBeCloseTo(841.89, 1);
    },
  );

  it('writes ordered PNG entries and one manifesto.csv to a ZIP', async () => {
    const output = new PassThrough();
    const bytesPromise = collect(output);

    await writeQrZip(
      output,
      [card(2, 'BBBB-BBBB'), card(1, 'AAAA-AAAA')],
      renderTinyPng,
    );

    const zip = await yauzl.fromBuffer(await bytesPromise);
    const names: string[] = [];
    try {
      for await (const entry of zip) names.push(entry.filename);
    } finally {
      await zip.close();
    }

    expect(names).toEqual([
      '001-AAAA-AAAA.png',
      '002-BBBB-BBBB.png',
      'manifesto.csv',
    ]);
  });

  it('rejects more than 500 cards before writing any artifact', async () => {
    const output = new PassThrough();
    const cards = Array.from({ length: MAX_QR_CARDS + 1 }, (_, index) =>
      card(index + 1, `CODE-${String(index + 1).padStart(4, '0')}`),
    );

    await expect(writeQrZip(output, cards)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(output.readableLength).toBe(0);
  });

  it('writes the maximum 500 ordered PNG entries plus one manifest', async () => {
    const output = new PassThrough();
    const bytesPromise = collect(output);
    const cards = Array.from({ length: MAX_QR_CARDS }, (_, index) =>
      card(index + 1, `CODE-${String(MAX_QR_CARDS - index).padStart(4, '0')}`),
    );

    await writeQrZip(output, cards, renderTinyPng);

    const zip = await yauzl.fromBuffer(await bytesPromise);
    const names: string[] = [];
    try {
      for await (const entry of zip) names.push(entry.filename);
    } finally {
      await zip.close();
    }

    expect(names).toHaveLength(MAX_QR_CARDS + 1);
    expect(names[0]).toBe('001-CODE-0001.png');
    expect(names[MAX_QR_CARDS - 1]).toBe('500-CODE-0500.png');
    expect(names.at(-1)).toBe('manifesto.csv');
  });
});
