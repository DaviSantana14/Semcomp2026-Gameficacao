import QRCode from 'qrcode';
import sharp from 'sharp';

export const MAX_QR_CARDS = 500;

export type QrCard = {
  sequence: number;
  code: string;
  actionName: string;
  kind: 'Uso único' | 'Reutilizável';
  batchId: string | null;
};

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

export function escapeXmlText(value: string) {
  return value.replace(/[&<>"']/g, (character) => XML_ESCAPES[character]);
}

export function sanitizeQrFileName(value: string) {
  const sanitized = value
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, 80);
  return sanitized || 'codigo';
}

export async function renderQrCardPng(card: QrCard): Promise<Buffer> {
  const qr = await QRCode.toBuffer(card.code, {
    errorCorrectionLevel: 'H',
    margin: 4,
    width: 900,
  });
  const batchLabel = card.batchId === null ? '' : `Lote: ${card.batchId}`;
  const label = Buffer.from(
    `<svg width="1200" height="390" xmlns="http://www.w3.org/2000/svg">
      <style>
        .code { font: 700 58px Arial, sans-serif; fill: #111827; }
        .action { font: 600 30px Arial, sans-serif; fill: #1f2937; }
        .kind { font: 26px Arial, sans-serif; fill: #4b5563; }
        .batch { font: 22px Arial, sans-serif; fill: #6b7280; }
      </style>
      <text class="code" x="600" y="72" text-anchor="middle">${escapeXmlText(card.code)}</text>
      <text class="action" x="600" y="132" text-anchor="middle">${escapeXmlText(card.actionName)}</text>
      <text class="kind" x="600" y="184" text-anchor="middle">${escapeXmlText(card.kind)}</text>
      <text class="batch" x="600" y="230" text-anchor="middle">${escapeXmlText(batchLabel)}</text>
      <text class="batch" x="600" y="278" text-anchor="middle">Sequência ${card.sequence}</text>
    </svg>`,
  );

  return sharp({
    create: {
      width: 1200,
      height: 1500,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([
      { input: qr, left: 150, top: 90 },
      { input: label, left: 0, top: 1050 },
    ])
    .png()
    .toBuffer();
}
