import { DownloadCapacityError } from '../../common/download-gate';
import { AuditService } from '../../audit/audit.service';
import { ActionsService } from '../../actions/actions.service';
import { AdminActionsController } from '../../actions/admin-actions.controller';
import { ClaimCodesController } from '../claim-codes.controller';
import { ClaimCodesService } from '../claim-codes.service';

function makeBatchArtifact() {
  return {
    cards: [
      {
        sequence: 1,
        code: 'AAAA-AAAA',
        actionName: 'Credenciamento',
        kind: 'Uso único' as const,
        batchId: 'batch-1',
      },
    ],
    metadata: {
      actionName: 'Credenciamento',
      batchId: 'batch-1',
    },
  };
}

describe('claim-code artifact data and endpoint integration', () => {
  it('maps a persisted batch to QR cards without exposing codes in metadata', async () => {
    const repository = {
      findBatchQrArtifact: jest.fn().mockResolvedValue({
        id: 'batch-1',
        actionName: 'Credenciamento',
        codes: ['AAAA-AAAA'],
      }),
    };
    const service = new ClaimCodesService(
      repository as never,
      { record: jest.fn() } as unknown as AuditService,
    );

    await expect(
      (
        service as unknown as { getBatchQrArtifact: (id: string) => unknown }
      ).getBatchQrArtifact('batch-1'),
    ).resolves.toEqual(makeBatchArtifact());
  });

  it('maps a reusable action code to a QR card without creating Claim Codes', async () => {
    const repository = {
      findReusableCodeQr: jest.fn().mockResolvedValue({
        id: 'action-1',
        name: 'Credenciamento',
        code: 'DIA1',
      }),
    };
    const service = new ActionsService(
      repository as never,
      { record: jest.fn() } as unknown as AuditService,
    );

    await expect(
      (
        service as unknown as {
          getReusableCodeQrArtifact: (id: string) => unknown;
        }
      ).getReusableCodeQrArtifact('action-1'),
    ).resolves.toEqual({
      cards: [
        {
          sequence: 1,
          code: 'DIA1',
          actionName: 'Credenciamento',
          kind: 'Reutilizável',
          batchId: null,
        },
      ],
      metadata: { actionName: 'Credenciamento', batchId: null },
    });
    expect(repository.findReusableCodeQr).toHaveBeenCalledWith('action-1');
  });

  it('sets download headers only after the QR writer accepts the request', async () => {
    const service = {
      getBatchQrArtifact: jest.fn().mockResolvedValue(makeBatchArtifact()),
    };
    const artifacts = {
      writeQrPdf: jest.fn((...args: unknown[]) => {
        const onStart = args[3] as (() => void) | undefined;
        onStart?.();
      }),
    };
    const response = { setHeader: jest.fn() };
    const controller = new ClaimCodesController(
      service as never,
      artifacts as never,
    );

    await controller.downloadBatchQrPdf('batch-1', response as never);

    expect(artifacts.writeQrPdf).toHaveBeenCalledWith(
      response,
      makeBatchArtifact().cards,
      makeBatchArtifact().metadata,
      expect.any(Function),
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store',
    );
  });

  it('returns the gate retry hint as a 429 response header', async () => {
    const service = {
      getBatchQrArtifact: jest.fn().mockResolvedValue(makeBatchArtifact()),
    };
    const artifacts = {
      writeQrPdf: jest.fn().mockRejectedValue(new DownloadCapacityError(30)),
    };
    const response = { setHeader: jest.fn() };
    const controller = new ClaimCodesController(
      service as never,
      artifacts as never,
    );

    await expect(
      controller.downloadBatchQrPdf('batch-1', response as never),
    ).rejects.toBeInstanceOf(DownloadCapacityError);
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '30');
  });

  it('exposes reusable PNG and PDF through the admin actions controller', async () => {
    const service = {
      getReusableCodeQrArtifact: jest.fn().mockResolvedValue({
        cards: [
          {
            sequence: 1,
            code: 'DIA1',
            actionName: 'Credenciamento',
            kind: 'Reutilizável',
            batchId: null,
          },
        ],
        metadata: { actionName: 'Credenciamento', batchId: null },
      }),
    };
    const artifacts = {
      writeQrPng: jest.fn((...args: unknown[]) => {
        const onStart = args[2] as (() => void) | undefined;
        onStart?.();
      }),
      writeQrPdf: jest.fn((...args: unknown[]) => {
        const onStart = args[3] as (() => void) | undefined;
        onStart?.();
      }),
    };
    const response = { setHeader: jest.fn() };
    const controller = new AdminActionsController(
      service as never,
      artifacts as never,
    );

    await controller.downloadReusableCodeQrPng('action-1', response as never);
    await controller.downloadReusableCodeQrPdf('action-1', response as never);

    expect(artifacts.writeQrPng).toHaveBeenCalled();
    expect(artifacts.writeQrPdf).toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'image/png',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
  });
});
