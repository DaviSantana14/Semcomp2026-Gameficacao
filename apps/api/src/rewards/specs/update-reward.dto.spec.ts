import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateRewardDto } from '../dto/update-reward.dto';

describe('UpdateRewardDto', () => {
  it('accepts explicit values that clear description and image', async () => {
    const dto = plainToInstance(UpdateRewardDto, {
      description: '   ',
      imageUrl: null,
    });

    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.description).toBe('');
    expect(dto.imageUrl).toBeNull();
  });

  it('still rejects a provided invalid image URL', async () => {
    const dto = plainToInstance(UpdateRewardDto, {
      imageUrl: 'not a url',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.property).toBe('imageUrl');
  });
});
