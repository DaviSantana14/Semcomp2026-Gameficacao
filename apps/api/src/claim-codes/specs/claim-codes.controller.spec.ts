import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ClaimCodesController } from '../claim-codes.controller';
import { GenerateClaimCodesDto } from '../dto/generate-claim-codes.dto';
import { ClaimCodesQueryDto } from '../dto/claim-codes-query.dto';
import { UpdateClaimCodeStatusDto } from '../dto/update-claim-code-status.dto';

describe('ClaimCodesController', () => {
  it('delegates history and status updates', async () => {
    const service = {
      findAll: jest.fn().mockResolvedValue({ items: [] }),
      updateStatus: jest.fn().mockResolvedValue({ id: 'c1' }),
    };
    const controller = new ClaimCodesController(service as never);
    await controller.findAll({ page: 1, limit: 20 });
    await controller.updateStatus('c1', { isActive: false });
    expect(service.findAll).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(service.updateStatus).toHaveBeenCalledWith('c1', {
      isActive: false,
    });
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
      controller.generate('action-1', { quantity: 2 }),
    ).resolves.toEqual(response);
    expect(service.generateBatch).toHaveBeenCalledWith('action-1', 2);
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
        plainToInstance(UpdateClaimCodeStatusDto, { isActive: false }),
      ),
    ).toHaveLength(0);
    expect(
      await validate(
        plainToInstance(UpdateClaimCodeStatusDto, { isActive: 'false' }),
      ),
    ).not.toHaveLength(0);
  });
});

describe('GenerateClaimCodesDto', () => {
  it.each([1, 500])('accepts boundary quantity %i', async (quantity) => {
    const dto = plainToInstance(GenerateClaimCodesDto, {
      quantity: String(quantity),
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.quantity).toBe(quantity);
  });

  it.each([0, 501, 1.5])('rejects invalid quantity %s', async (quantity) => {
    const dto = plainToInstance(GenerateClaimCodesDto, { quantity });

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
