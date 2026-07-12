import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminParticipantRedemptionsQueryDto } from './admin-participant-redemptions-query.dto';

describe('AdminParticipantRedemptionsQueryDto', () => {
  it.each(['all', 'pending', 'delivered', 'cancelled'])(
    'accepts the public lowercase status %s',
    async (status) => {
      const dto = plainToInstance(AdminParticipantRedemptionsQueryDto, {
        page: 1,
        limit: 20,
        status,
      });

      await expect(validate(dto)).resolves.toHaveLength(0);
    },
  );

  it.each(['PENDING', 'DELIVERED', 'CANCELLED', 'invalid'])(
    'rejects non-contract status %s',
    async (status) => {
      const dto = plainToInstance(AdminParticipantRedemptionsQueryDto, {
        page: 1,
        limit: 20,
        status,
      });

      expect(await validate(dto)).not.toHaveLength(0);
    },
  );
});
