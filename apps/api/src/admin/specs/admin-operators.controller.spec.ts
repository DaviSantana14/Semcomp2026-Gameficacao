import { AdminProfile } from '@prisma/client';
import { AdminProfilesGuard } from '../../auth/admin-profiles.guard';
import { ADMIN_PROFILES_KEY } from '../../auth/admin-profiles.decorator';
import { CsrfGuard } from '../../auth/csrf.guard';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminOperatorsController } from '../admin-operators.controller';

describe(AdminOperatorsController.name, () => {
  it('declares JWT, CSRF, and GENERAL-only protection', () => {
    expect(Reflect.getMetadata('__guards__', AdminOperatorsController)).toEqual(
      [JwtAuthGuard, CsrfGuard, AdminProfilesGuard],
    );
    expect(
      Reflect.getMetadata(ADMIN_PROFILES_KEY, AdminOperatorsController),
    ).toEqual([AdminProfile.GENERAL]);
  });

  it('passes normalized request context to operator mutations', async () => {
    const operators = {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateStatus: jest.fn().mockResolvedValue({}),
      resetActivation: jest.fn().mockResolvedValue({}),
    };
    const controller = new AdminOperatorsController(operators as never);
    const request = { user: { id: 'general-1' }, requestId: 'request-1' };

    await controller.create(
      { reason: 'Cadastro operacional confirmado' } as never,
      request as never,
    );
    await controller.update(
      'operator-1',
      { reason: 'Edicao operacional confirmada' },
      request as never,
    );
    await controller.updateStatus(
      'operator-1',
      { isActive: false, reason: 'Status operacional confirmado' },
      request as never,
    );
    await controller.resetActivation(
      'operator-1',
      { reason: 'Reset operacional confirmado' },
      request as never,
    );

    expect(operators.create).toHaveBeenCalledWith(expect.anything(), {
      actorAdminId: 'general-1',
      requestId: 'request-1',
    });
    expect(operators.update).toHaveBeenCalledWith(
      'operator-1',
      expect.anything(),
      { actorAdminId: 'general-1', requestId: 'request-1' },
    );
  });
});
