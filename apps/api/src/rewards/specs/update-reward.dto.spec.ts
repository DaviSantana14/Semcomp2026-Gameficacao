import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateRewardDto } from '../dto/update-reward.dto';
import { CreateRewardDto } from '../dto/create-reward.dto';
import { RedemptionTransitionDto } from '../dto/redemption-transition.dto';

describe('UpdateRewardDto', () => {
  it.each([CreateRewardDto, UpdateRewardDto, RedemptionTransitionDto])(
    'requires and normalizes an administrative reason in %p',
    async (Dto) => {
      const missing = plainToInstance(Dto, {});
      expect(await validate(missing)).not.toHaveLength(0);

      const dto = plainToInstance(Dto, {
        reason: '  Operacao autorizada pela coordenação  ',
      });
      const errors = await validate(dto);
      expect(errors.map((error) => error.property)).not.toContain('reason');
      expect(dto.reason).toBe('Operacao autorizada pela coordenação');
    },
  );

  it('accepts explicit values that clear description and image', async () => {
    const dto = plainToInstance(UpdateRewardDto, {
      reason: 'Atualizacao solicitada pela coordenação',
      description: '   ',
      imageUrl: null,
    });

    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.description).toBe('');
    expect(dto.imageUrl).toBeNull();
  });

  it('still rejects a provided invalid image URL', async () => {
    const dto = plainToInstance(UpdateRewardDto, {
      reason: 'Atualizacao solicitada pela coordenação',
      imageUrl: 'not a url',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.property).toBe('imageUrl');
  });
});
