import { ActionType, UserRole } from '@prisma/client';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import yauzl from 'yauzl-promise';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AdminE2eHarness, type AuthSession } from './support/admin-e2e-harness';
import { hasDisposableTestDatabaseConfiguration } from './support/e2e-database-cleanup';

const describeDisposable = hasDisposableTestDatabaseConfiguration()
  ? describe
  : describe.skip;

function binaryParser(
  response: NodeJS.ReadableStream,
  callback: (error: Error | null, body?: Buffer) => void,
) {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(chunk));
  response.on('error', (error: Error) => callback(error));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
}

describeDisposable('Admin claim-code artifacts (e2e)', () => {
  let harness: AdminE2eHarness;
  let adminSession: AuthSession;
  let participantSession: AuthSession;
  let actionId: string;
  let reusableActionId: string;
  let suffix: string;

  beforeAll(async () => {
    harness = await AdminE2eHarness.create();
    suffix = randomUUID();
    const [admin, participant] = await Promise.all([
      harness.prisma.user.create({
        data: {
          name: `Artifact admin ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 1),
          email: `artifact-admin-${suffix}@example.test`,
          role: UserRole.ADMIN,
        },
      }),
      harness.prisma.user.create({
        data: {
          name: `Artifact participant ${suffix}`,
          cpf: harness.uniqueCpf(suffix, 2),
          email: `artifact-participant-${suffix}@example.test`,
        },
      }),
    ]);
    const [claimAction, reusableAction] = await Promise.all([
      harness.prisma.action.create({
        data: {
          name: `Artifact claim action ${suffix}`,
          type: ActionType.CHECKIN,
          points: 3,
        },
      }),
      harness.prisma.action.create({
        data: {
          name: `Artifact reusable action ${suffix}`,
          type: ActionType.BONUS,
          code: `REUSABLE-${suffix}`.toUpperCase(),
          points: 4,
          isCodeActive: true,
        },
      }),
    ]);
    actionId = claimAction.id;
    reusableActionId = reusableAction.id;
    adminSession = await harness.login(admin.cpf, admin.email);
    participantSession = await harness.login(
      participant.cpf,
      participant.email,
    );
  });

  afterAll(async () => {
    if (harness) await harness.close();
  });

  it('downloads batch PDF/ZIP and reusable PNG/PDF without creating Claim Codes', async () => {
    const generated = await harness
      .post(`/admin/actions/${actionId}/claim-codes/generate`, adminSession)
      .send({ quantity: 2, reason: 'Geracao de artefatos QR E2E' })
      .expect(201);
    const batchId = (generated.body as { batch: { id: string } }).batch.id;
    const claimCountBefore = await harness.prisma.claimCode.count({
      where: { actionId: reusableActionId },
    });

    const pdf = await harness
      .get(`/admin/claim-code-batches/${batchId}/qr.pdf`, adminSession)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    expect(pdf.headers['content-type']).toMatch(/^application\/pdf/);
    expect(pdf.headers['cache-control']).toBe('no-store');
    expect(pdf.headers['content-disposition']).toContain(
      `codigos-${batchId}-qr.pdf`,
    );
    expect((await PDFDocument.load(pdf.body as Buffer)).getPageCount()).toBe(1);

    const zipResponse = await harness
      .get(`/admin/claim-code-batches/${batchId}/qr-images.zip`, adminSession)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    expect(zipResponse.headers['content-type']).toMatch(/^application\/zip/);
    const zip = await yauzl.fromBuffer(zipResponse.body as Buffer);
    const entryNames: string[] = [];
    try {
      for await (const entry of zip) entryNames.push(entry.filename);
    } finally {
      await zip.close();
    }
    expect(entryNames).toHaveLength(3);
    expect(entryNames.at(-1)).toBe('manifesto.csv');
    expect(entryNames.slice(0, 2).every((name) => name.endsWith('.png'))).toBe(
      true,
    );

    const png = await harness
      .get(`/admin/reusable-codes/${reusableActionId}/qr.png`, adminSession)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    expect(png.headers['content-type']).toMatch(/^image\/png/);
    expect(await sharp(png.body as Buffer).metadata()).toMatchObject({
      format: 'png',
      width: 1200,
      height: 1500,
    });

    const reusablePdf = await harness
      .get(`/admin/reusable-codes/${reusableActionId}/qr.pdf`, adminSession)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    expect(
      (await PDFDocument.load(reusablePdf.body as Buffer)).getPageCount(),
    ).toBe(1);
    expect(
      await harness.prisma.claimCode.count({
        where: { actionId: reusableActionId },
      }),
    ).toBe(claimCountBefore);

    await harness
      .get(`/admin/claim-code-batches/${batchId}/qr.pdf`, participantSession)
      .expect(403);
    await request(harness.app.getHttpServer())
      .get(`/admin/reusable-codes/${reusableActionId}/qr.png`)
      .expect(401);
  });
});
