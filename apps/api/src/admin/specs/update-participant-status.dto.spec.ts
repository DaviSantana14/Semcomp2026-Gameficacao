import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateParticipantStatusDto } from '../dto/update-participant-status.dto';

describe(UpdateParticipantStatusDto.name, () => {
  it('requires and normalizes a reason', async () => {
    const missing = plainToInstance(UpdateParticipantStatusDto, {
      isActive: false,
    });
    expect(await validate(missing)).not.toHaveLength(0);

    const valid = plainToInstance(UpdateParticipantStatusDto, {
      isActive: false,
      reason: '  Solicitacao operacional confirmada  ',
    });
    expect(await validate(valid)).toHaveLength(0);
    expect(valid.reason).toBe('Solicitacao operacional confirmada');
  });

  it.each(['', 'curto', ' '.repeat(20), 'a'.repeat(501)])(
    'rejects invalid reason %p',
    async (reason) => {
      const dto = plainToInstance(UpdateParticipantStatusDto, {
        isActive: false,
        reason,
      });
      expect(await validate(dto)).not.toHaveLength(0);
    },
  );
});
