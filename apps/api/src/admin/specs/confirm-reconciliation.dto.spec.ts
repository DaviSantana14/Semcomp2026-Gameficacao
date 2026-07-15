import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConfirmReconciliationDto } from '../dto/confirm-reconciliation.dto';

describe(ConfirmReconciliationDto.name, () => {
  it('normalizes a valid reason and accepts a UUID idempotency key', async () => {
    const dto = plainToInstance(ConfirmReconciliationDto, {
      reason: '  Correcao do ledger confirmada  ',
      idempotencyKey: '5c5b4dc4-1a47-4cc3-a758-fbeec37e92d8',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.reason).toBe('Correcao do ledger confirmada');
  });

  it.each([
    [{ reason: 'curto', idempotencyKey: crypto.randomUUID() }],
    [{ reason: 'Motivo operacional valido', idempotencyKey: 'not-a-uuid' }],
  ])('rejects invalid confirmation input', async (input) => {
    expect(
      await validate(plainToInstance(ConfirmReconciliationDto, input)),
    ).not.toHaveLength(0);
  });
});
