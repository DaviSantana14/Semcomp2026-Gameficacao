import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReversePointEventDto } from '../dto/reverse-point-event.dto';

describe(ReversePointEventDto.name, () => {
  it('trims and accepts a valid reversal intention', async () => {
    const dto = plainToInstance(ReversePointEventDto, {
      reason: '  Estorno administrativo confirmado  ',
      idempotencyKey: '1d61fd98-1470-4ed2-95b9-1ae6fe310b18',
    });

    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.reason).toBe('Estorno administrativo confirmado');
  });

  it.each([
    { reason: 'curto', idempotencyKey: '1d61fd98-1470-4ed2-95b9-1ae6fe310b18' },
    { reason: 'Estorno administrativo confirmado', idempotencyKey: 'invalid' },
  ])('rejects invalid reversal input %#', async (input) => {
    const dto = plainToInstance(ReversePointEventDto, input);
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
