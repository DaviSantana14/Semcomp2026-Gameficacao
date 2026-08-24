import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ClaimCodesController } from '../claim-codes.controller';
import { GenerateClaimCodesDto } from '../dto/generate-claim-codes.dto';
import { ClaimCodesQueryDto } from '../dto/claim-codes-query.dto';
import { UpdateClaimCodeStatusDto } from '../dto/update-claim-code-status.dto';
import { BulkClaimCodeStatusDto } from '../dto/bulk-claim-code-status.dto';

describe('ClaimCodesController', () => {
  const request = {
    user: { id: 'admin-1' },
    requestId: 'request-1',
  } as never;

  it('delegates history and status updates with the admin context', async () => {
    const service = {
      findAll: jest.fn().mockResolvedValue({ items: [] }),
      updateStatus: jest.fn().mockResolvedValue({ id: 'c1' }),
    };
    const controller = new ClaimCodesController(service as never);
    await controller.findAll({ page: 1, limit: 20 });
    await controller.updateStatus(
      'c1',
      { isActive: false, reason: 'Desativacao administrativa do codigo' },
      request,
    );
    expect(service.findAll).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(service.updateStatus).toHaveBeenCalledWith(
      'c1',
      {
        isActive: false,
        reason: 'Desativacao administrativa do codigo',
      },
      { actorAdminId: 'admin-1', requestId: 'request-1' },
    );
  });
  it('delegates generation with the action id and requested quantity', async () => {
    const response = {
      action: { id: 'action-1', name: 'Credenciamento' },
      quantity: 2,
      codes: ['AAAA-AAAA', 'BBBB-BBBB'],
    };
    const service = { generateBatch: jest.fn().mockResolvedValue(response) };
    const controller = new ClaimCodesController(service as never);

    await expect(
      controller.generate(
        'action-1',
        { quantity: 2, reason: 'Geracao administrativa para credenciamento' },
        request,
      ),
    ).resolves.toEqual(response);
    expect(service.generateBatch).toHaveBeenCalledWith(
      'action-1',
      { quantity: 2, reason: 'Geracao administrativa para credenciamento' },
      { actorAdminId: 'admin-1', requestId: 'request-1' },
    );
  });

  it('delegates batch list and detail queries', async () => {
    const service = {
      findBatches: jest.fn().mockResolvedValue({ items: [], meta: {} }),
      findBatch: jest.fn().mockResolvedValue({ id: 'batch-1' }),
    };
    const controller = new ClaimCodesController(service as never);
    const query = { page: 1, limit: 20, actionId: 'action-1' };

    await expect(controller.findBatches(query as never)).resolves.toEqual({
      items: [],
      meta: {},
    });
    await expect(controller.findBatch('batch-1')).resolves.toEqual({
      id: 'batch-1',
    });
    expect(service.findBatches).toHaveBeenCalledWith(query);
    expect(service.findBatch).toHaveBeenCalledWith('batch-1');
  });

  it('downloads sorted persisted codes as a no-store text attachment', async () => {
    const service = {
      getBatchCodes: jest.fn().mockResolvedValue(['BBBB-BBBB', 'AAAA-AAAA']),
    };
    const controller = new ClaimCodesController(service as never);
    const setHeader = jest.fn();
    const send = jest.fn().mockReturnThis();

    await controller.downloadBatchText('batch-1', {
      setHeader,
      send,
    } as never);

    expect(service.getBatchCodes).toHaveBeenCalledWith('batch-1');
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/plain; charset=utf-8',
    );
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="codigos-batch-1.txt"',
    );
    expect(send).toHaveBeenCalledWith('AAAA-AAAA\nBBBB-BBBB\n');
  });

  it('delegates bulk status, history, detail and report downloads', async () => {
    const dto: BulkClaimCodeStatusDto = {
      ids: ['code-1'],
      isActive: false,
      reason: 'Desativacao preventiva do codigo selecionado',
      confirmation: 'DESATIVAR',
    };
    const service = {
      bulkUpdateStatus: jest.fn().mockResolvedValue({ id: 'bulk-1' }),
      findBulkOperations: jest.fn().mockResolvedValue({ items: [], meta: {} }),
      findBulkOperation: jest.fn().mockResolvedValue({ id: 'bulk-1' }),
      getBulkReport: jest.fn().mockResolvedValue([
        {
          requestedClaimCodeId: 'code-1',
          maskedCode: 'AB*****GH',
          outcome: 'CHANGED',
        },
      ]),
    };
    const controller = new ClaimCodesController(service as never);

    await expect(controller.bulkUpdateStatus(dto, request)).resolves.toEqual({
      id: 'bulk-1',
    });
    await expect(
      controller.findBulkOperations({ page: 1, limit: 20 }),
    ).resolves.toEqual({ items: [], meta: {} });
    await expect(controller.findBulkOperation('bulk-1')).resolves.toEqual({
      id: 'bulk-1',
    });

    const setHeader = jest.fn();
    const send = jest.fn().mockReturnThis();
    await controller.downloadBulkReport('bulk-1', {
      setHeader,
      send,
    } as never);

    expect(service.bulkUpdateStatus).toHaveBeenCalledWith(dto, {
      actorAdminId: 'admin-1',
      requestId: 'request-1',
    });
    expect(service.findBulkOperations).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
    });
    expect(service.findBulkOperation).toHaveBeenCalledWith('bulk-1');
    expect(service.getBulkReport).toHaveBeenCalledWith('bulk-1');
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/csv; charset=utf-8',
    );
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="codigos-bulk-bulk-1.csv"',
    );
    expect(send).toHaveBeenCalledWith(expect.stringContaining('codigo_id;'));
  });
});

describe('Claim code admin DTOs', () => {
  it('uppercases, trims and limits search', async () => {
    const dto = plainToInstance(ClaimCodesQueryDto, {
      page: '1',
      limit: '20',
      search: ' abcd-efgh ',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.search).toBe('ABCD-EFGH');
    const invalid = plainToInstance(ClaimCodesQueryDto, {
      search: 'x'.repeat(101),
    });
    expect(await validate(invalid)).not.toHaveLength(0);
  });
  it('requires a boolean status', async () => {
    expect(
      await validate(
        plainToInstance(UpdateClaimCodeStatusDto, {
          isActive: false,
          reason: 'Desativacao administrativa do codigo',
        }),
      ),
    ).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(UpdateClaimCodeStatusDto, { isActive: 'false' }),
      ),
    ).not.toHaveLength(0);
  });

  it.each([
    [
      'generation',
      () =>
        plainToInstance(GenerateClaimCodesDto, {
          quantity: 1,
          reason: '  Motivo administrativo valido  ',
        }),
      () =>
        plainToInstance(GenerateClaimCodesDto, {
          quantity: 1,
          reason: ' curto ',
        }),
    ],
    [
      'status',
      () =>
        plainToInstance(UpdateClaimCodeStatusDto, {
          isActive: false,
          reason: '  Motivo administrativo valido  ',
        }),
      () =>
        plainToInstance(UpdateClaimCodeStatusDto, {
          isActive: false,
          reason: ' curto ',
        }),
    ],
  ])(
    'trims and requires a meaningful reason for %s',
    async (_label, makeValid, makeInvalid) => {
      const valid = makeValid();
      expect(await validate(valid)).toHaveLength(0);
      expect(valid.reason).toBe('Motivo administrativo valido');

      const invalid = makeInvalid();
      expect(await validate(invalid)).not.toHaveLength(0);
    },
  );
});

describe('GenerateClaimCodesDto', () => {
  it.each([1, 500])('accepts boundary quantity %i', async (quantity) => {
    const dto = plainToInstance(GenerateClaimCodesDto, {
      quantity: String(quantity),
      reason: 'Geracao administrativa do lote',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.quantity).toBe(quantity);
  });

  it.each([0, 501, 1.5])('rejects invalid quantity %s', async (quantity) => {
    const dto = plainToInstance(GenerateClaimCodesDto, {
      quantity,
      reason: 'Geracao administrativa do lote',
    });

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
