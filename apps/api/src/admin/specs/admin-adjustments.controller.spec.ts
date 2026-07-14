import { UserRole } from '@prisma/client';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { CsrfGuard } from '../../auth/csrf.guard';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ROLES_KEY } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { AdminAdjustmentsController } from '../admin-adjustments.controller';

describe(AdminAdjustmentsController.name, () => {
  const service = { adjust: jest.fn(), reverse: jest.fn() };
  const controller = new AdminAdjustmentsController(service as never);

  beforeEach(() => jest.clearAllMocks());

  it('passes the participant, DTO and trusted admin context to the service', async () => {
    const dto = {
      pointsDelta: 10,
      xpDelta: 0,
      reason: 'Correcao operacional confirmada',
      idempotencyKey: '1d61fd98-1470-4ed2-95b9-1ae6fe310b18',
    };
    const request = { user: { id: 'admin-1' }, requestId: 'request-1' };
    service.adjust.mockResolvedValue({ replayed: false });

    await expect(
      controller.adjust('participant-1', dto, request as never),
    ).resolves.toEqual({ replayed: false });
    expect(service.adjust).toHaveBeenCalledWith('participant-1', dto, {
      actorAdminId: 'admin-1',
      requestId: 'request-1',
    });
  });

  it('requires JWT, CSRF semantics and the administrator role', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminAdjustmentsController),
    ).toEqual([JwtAuthGuard, CsrfGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, AdminAdjustmentsController)).toEqual([
      UserRole.ADMIN,
    ]);
  });

  it('passes the event, DTO and trusted admin context for reversal', async () => {
    const dto = {
      reason: 'Estorno administrativo confirmado',
      idempotencyKey: '1d61fd98-1470-4ed2-95b9-1ae6fe310b18',
    };
    const request = { user: { id: 'admin-1' }, requestId: 'request-1' };
    service.reverse.mockResolvedValue({ replayed: false });

    await expect(
      controller.reverse('event-1', dto, request as never),
    ).resolves.toEqual({ replayed: false });
    expect(service.reverse).toHaveBeenCalledWith('event-1', dto, {
      actorAdminId: 'admin-1',
      requestId: 'request-1',
    });
  });
});
