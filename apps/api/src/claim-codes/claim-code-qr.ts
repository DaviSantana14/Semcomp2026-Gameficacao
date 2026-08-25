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

export function renderQrCardLabelSvg(card: QrCard): Buffer {
  const batchLabel = card.batchId === null ? '' : `Lote: ${card.batchId}`;
  const fontFamily = 'DejaVu Sans';
  return Buffer.from(
    `<svg width="1200" height="390" xmlns="http://www.w3.org/2000/svg">
      <text x="600" y="96" text-anchor="middle" font-family="${fontFamily}" font-size="80" font-weight="700" fill="#111827">${escapeXmlText(card.code)}</text>
      <text x="600" y="164" text-anchor="middle" font-family="${fontFamily}" font-size="30" font-weight="600" fill="#1f2937">${escapeXmlText(card.actionName)}</text>
      <text x="600" y="218" text-anchor="middle" font-family="${fontFamily}" font-size="26" fill="#4b5563">${escapeXmlText(card.kind)}</text>
      <text x="600" y="266" text-anchor="middle" font-family="${fontFamily}" font-size="22" fill="#6b7280">${escapeXmlText(batchLabel)}</text>
      <text x="600" y="314" text-anchor="middle" font-family="${fontFamily}" font-size="22" fill="#6b7280">Sequência ${card.sequence}</text>
    </svg>`,
  );
}

export async function renderQrCardPng(card: QrCard): Promise<Buffer> {
  const qr = await QRCode.toBuffer(card.code, {
    errorCorrectionLevel: 'H',
    margin: 4,
    width: 900,
  });
  const label = renderQrCardLabelSvg(card);

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
