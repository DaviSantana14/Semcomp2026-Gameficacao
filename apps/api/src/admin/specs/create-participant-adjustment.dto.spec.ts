import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateParticipantAdjustmentDto } from '../dto/create-participant-adjustment.dto';

describe(CreateParticipantAdjustmentDto.name, () => {
  const valid = {
    pointsDelta: 10,
    xpDelta: 5,
    reason: '  Correcao operacional confirmada  ',
    idempotencyKey: '1d61fd98-1470-4ed2-95b9-1ae6fe310b18',
  };

  it('accepts valid input and normalizes the reason', async () => {
    const dto = plainToInstance(CreateParticipantAdjustmentDto, valid);

    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.reason).toBe('Correcao operacional confirmada');
  });

  it.each([
    [{ pointsDelta: 0, xpDelta: 0 }, 'zero deltas'],
    [{ pointsDelta: 1, xpDelta: -1 }, 'opposite directions'],
    [{ pointsDelta: 1.5 }, 'non-integer points'],
    [{ xpDelta: 1.5 }, 'non-integer XP'],
    [{ reason: 'curto' }, 'short reason'],
    [{ reason: '          ' }, 'blank reason'],
    [{ idempotencyKey: 'not-a-uuid' }, 'invalid idempotency key'],
  ])('rejects %s (%s)', async (override) => {
    const errors = await validate(
      plainToInstance(CreateParticipantAdjustmentDto, {
        ...valid,
        ...override,
      }),
    );

    expect(errors.length).toBeGreaterThan(0);
  });
});
