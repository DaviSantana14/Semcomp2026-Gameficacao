import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ClaimCodesController } from './claim-codes.controller';
import { GenerateClaimCodesDto } from './dto/generate-claim-codes.dto';

describe('ClaimCodesController', () => {
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
