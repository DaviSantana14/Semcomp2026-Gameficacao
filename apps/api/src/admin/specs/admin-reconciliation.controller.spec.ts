import { GUARDS_METADATA } from '@nestjs/common/constants';
import { UserRole } from '@prisma/client';
import { CsrfGuard } from '../../auth/csrf.guard';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ROLES_KEY } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { AdminReconciliationController } from '../admin-reconciliation.controller';
import { ReconciliationFilter } from '../dto/list-reconciliation.dto';

describe(AdminReconciliationController.name, () => {
  const service = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    getSummary: jest.fn(),
    confirm: jest.fn(),
  };
  const controller = new AdminReconciliationController(service as never);

  beforeEach(() => jest.clearAllMocks());

  it('delegates summary, list and participant detail without mutation context', async () => {
    const query = {
      page: 1,
      limit: 20,
      filter: ReconciliationFilter.ALL,
    };
    service.getSummary.mockResolvedValue({ divergentParticipants: 2 });
    service.findAll.mockResolvedValue({ items: [] });
    service.findOne.mockResolvedValue({ participantId: 'p1' });

    await expect(controller.summary()).resolves.toEqual({
      divergentParticipants: 2,
    });
    await expect(controller.findAll(query)).resolves.toEqual({ items: [] });
    await expect(controller.findOne('p1')).resolves.toEqual({
      participantId: 'p1',
    });
    expect(service.findAll).toHaveBeenCalledWith(query);
    expect(service.findOne).toHaveBeenCalledWith('p1');
  });

  it('passes confirmation input and the authenticated admin context', async () => {
    const dto = {
      reason: 'Correcao operacional confirmada',
      idempotencyKey: crypto.randomUUID(),
    };
    const request = {
      user: { id: 'admin-1' },
      requestId: 'request-1',
    };
    service.confirm.mockResolvedValue({ replayed: false });

    await expect(
      controller.confirm('participant-1', dto, request as never),
    ).resolves.toEqual({ replayed: false });
    expect(service.confirm).toHaveBeenCalledWith('participant-1', dto, {
      actorAdminId: 'admin-1',
      requestId: 'request-1',
    });
  });

  it('requires JWT, CSRF semantics and the administrator role', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminReconciliationController),
    ).toEqual([JwtAuthGuard, CsrfGuard, RolesGuard]);
    expect(
      Reflect.getMetadata(ROLES_KEY, AdminReconciliationController),
    ).toEqual([UserRole.ADMIN]);
  });
});
