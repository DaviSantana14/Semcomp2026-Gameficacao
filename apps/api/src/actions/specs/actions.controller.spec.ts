import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../../auth/roles.decorator';
import { ActionsController } from '../actions.controller';

describe('ActionsController player authorization', () => {
  const service = {
    redeem: jest.fn(),
    redeemByCode: jest.fn(),
  };
  const controller = new ActionsController(service as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(['redeem', 'redeemByCode'] as const)(
    'restricts %s to participants',
    (method) => {
      expect(Reflect.getMetadata(ROLES_KEY, controller[method])).toEqual([
        UserRole.PARTICIPANT,
      ]);
    },
  );

  it('delegates direct redemption with action and authenticated user ids', async () => {
    const redeemed = {
      points: 10,
      xp: 10,
      level: 1,
      action: {
        id: 'action-1',
        name: 'Credenciamento',
        description: null,
        type: 'DYNAMIC',
        code: null,
        points: 10,
        isActive: true,
        isCodeActive: false,
        createdAt: new Date('2026-07-11T12:00:00.000Z'),
        updatedAt: new Date('2026-07-11T12:00:00.000Z'),
      },
    };
    service.redeem.mockResolvedValue(redeemed);

    await controller.redeem('action-1', { user: { id: 'user-1' } });

    expect(service.redeem).toHaveBeenCalledWith('action-1', 'user-1');
  });

  it('delegates code redemption with the code and authenticated user id', async () => {
    service.redeemByCode.mockResolvedValue({
      points: 10,
      xp: 10,
      level: 1,
      action: {
        id: 'action-1',
        name: 'Credenciamento',
        description: null,
        type: 'DYNAMIC',
        code: 'DIA1',
        points: 10,
        isActive: true,
        isCodeActive: true,
        createdAt: new Date('2026-07-11T12:00:00.000Z'),
        updatedAt: new Date('2026-07-11T12:00:00.000Z'),
      },
    });

    await controller.redeemByCode({ code: 'DIA1' }, { user: { id: 'user-1' } });

    expect(service.redeemByCode).toHaveBeenCalledWith('DIA1', 'user-1');
  });
});
