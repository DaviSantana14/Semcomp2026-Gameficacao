import { UserRole } from '@prisma/client';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CsrfGuard } from '../auth/csrf.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminActionsController } from './admin-actions.controller';

describe('AdminActionsController', () => {
  const service = {
    findAdminActions: jest.fn(),
    update: jest.fn(),
    findReusableCodes: jest.fn(),
    findReusableCodeRedemptions: jest.fn(),
  };
  const controller = new AdminActionsController(service as never);

  beforeEach(() => jest.clearAllMocks());

  it('protects every endpoint with authentication, CSRF and admin role', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminActionsController)).toEqual([
      UserRole.ADMIN,
    ]);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminActionsController),
    ).toEqual([JwtAuthGuard, CsrfGuard, RolesGuard]);
  });

  it('delegates action listing and partial updates', async () => {
    const query = { page: 1, limit: 20 };
    const dto = { points: 25 };
    await controller.findAll(query);
    await controller.update('action-1', dto);
    expect(service.findAdminActions).toHaveBeenCalledWith(query);
    expect(service.update).toHaveBeenCalledWith('action-1', dto);
  });

  it('delegates reusable history listing and detail', async () => {
    const query = { page: 1, limit: 20 };
    await controller.findReusableCodes(query);
    await controller.findReusableCodeRedemptions('action-1', query);
    expect(service.findReusableCodes).toHaveBeenCalledWith(query);
    expect(service.findReusableCodeRedemptions).toHaveBeenCalledWith(
      'action-1',
      query,
    );
  });
});
