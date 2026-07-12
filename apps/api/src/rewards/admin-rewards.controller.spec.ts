import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../auth/roles.decorator';
import { AdminRewardsController } from './admin-rewards.controller';

describe('AdminRewardsController', () => {
  it('guards the whole controller as admin', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminRewardsController)).toEqual([
      UserRole.ADMIN,
    ]);
  });

  it('delegates catalog and history queries', async () => {
    const service = {
      findAdminRewards: jest.fn().mockResolvedValue({ items: [], meta: {} }),
      findRedemptions: jest.fn().mockResolvedValue({ items: [], meta: {} }),
    };
    const controller = new AdminRewardsController(service as never);
    const query = { page: 1, limit: 20 };

    await controller.findRewards(query);
    await controller.findRedemptions(query);

    expect(service.findAdminRewards).toHaveBeenCalledWith(query);
    expect(service.findRedemptions).toHaveBeenCalledWith(query);
  });
});
