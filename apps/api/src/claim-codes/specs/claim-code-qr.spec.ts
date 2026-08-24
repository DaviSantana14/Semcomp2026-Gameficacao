import {
  BinaryBitmap,
  HybridBinarizer,
  QRCodeReader,
  RGBLuminanceSource,
} from '@zxing/library';
import sharp from 'sharp';
import { renderQrCardPng, type QrCard } from '../claim-code-qr';

jest.setTimeout(30_000);

async function decodeQrPng(png: Buffer) {
  const { data, info } = await sharp(png)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const source = new RGBLuminanceSource(
    new Uint8ClampedArray(data),
    info.width,
    info.height,
  );
  return new QRCodeReader()
    .decode(new BinaryBitmap(new HybridBinarizer(source)))
    .getText();
}

describe('claim-code QR card renderer', () => {
  const card: QrCard = {
    sequence: 1,
    code: 'ABCD-EFGH',
    actionName: 'Credenciamento <VIP>',
    kind: 'Uso único',
    batchId: 'batch-1',
  };

  it('renders a decodable 1200 by 1500 PNG with the approved card metadata', async () => {
    const png = await renderQrCardPng(card);
    const metadata = await sharp(png).metadata();

    await expect(decodeQrPng(png)).resolves.toBe(card.code);
    expect(metadata).toMatchObject({
      format: 'png',
      width: 1200,
      height: 1500,
    });
  });

  it('escapes card text before composing the SVG label', async () => {
    const png = await renderQrCardPng(card);

    expect(png.toString('base64')).not.toContain('Credenciamento <VIP>');
    expect(png.length).toBeGreaterThan(0);
  });
});
