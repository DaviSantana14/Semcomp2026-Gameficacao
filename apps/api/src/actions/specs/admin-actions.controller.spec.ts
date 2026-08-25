import { AdminProfile } from '@prisma/client';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { DECORATORS } from '@nestjs/swagger/dist/constants';
import { ADMIN_PROFILES_KEY } from '../../auth/admin-profiles.decorator';
import { AdminProfilesGuard } from '../../auth/admin-profiles.guard';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CsrfGuard } from '../../auth/csrf.guard';
import { AdminActionsController } from '../admin-actions.controller';
import { ActionResponseDto } from '../dto/action-response.dto';

describe('AdminActionsController', () => {
  const service = {
    create: jest.fn().mockResolvedValue({}),
    findAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue({}),
    findAdminActions: jest.fn(),
    update: jest.fn(),
    findReusableCodes: jest.fn(),
    findReusableCodeRedemptions: jest.fn(),
    grantQuestionAction: jest.fn().mockResolvedValue({}),
    findQuestionGrantParticipants: jest.fn().mockResolvedValue({}),
  };
  const controller = new AdminActionsController(service as never);

  beforeEach(() => jest.clearAllMocks());

  it('protects every endpoint with authentication, CSRF and profile metadata', () => {
    expect(
      Reflect.getMetadata(ADMIN_PROFILES_KEY, AdminActionsController),
    ).toEqual([AdminProfile.GENERAL, AdminProfile.ACTIVITIES]);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminActionsController),
    ).toEqual([JwtAuthGuard, CsrfGuard, AdminProfilesGuard]);
  });

  it('delegates action listing and partial updates', async () => {
    const query = { page: 1, limit: 20 };
    const dto = { points: 25 };
    await controller.findAll(query);
    const request = { user: { id: 'admin-1' }, requestId: 'request-1' };
    await controller.update('action-1', dto as never, request as never);
    expect(service.findAdminActions).toHaveBeenCalledWith(query);
    expect(service.update).toHaveBeenCalledWith('action-1', dto, {
      actorAdminId: 'admin-1',
      requestId: 'request-1',
    });
  });

  it('owns and delegates the legacy administrative action endpoints', async () => {
    const dto = {
      name: 'Credenciamento',
      type: 'CHECKIN' as const,
      points: 10,
    };

    const request = { user: { id: 'admin-1' }, requestId: 'request-1' };
    await controller.create(dto as never, request as never);
    await controller.findLegacyActions();
    await controller.findLegacyActionById('action-1');

    expect(service.create).toHaveBeenCalledWith(dto, {
      actorAdminId: 'admin-1',
      requestId: 'request-1',
    });
    expect(service.findAll).toHaveBeenCalledWith();
    expect(service.findById).toHaveBeenCalledWith('action-1');
  });

  it('documents the partial update response with the returned action shape', () => {
    const updateHandler = Object.getOwnPropertyDescriptor(
      AdminActionsController.prototype,
      'update',
    )?.value as object;
    const responses = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      updateHandler,
    ) as Record<number, { type?: unknown }>;

    expect(responses[200].type).toBe(ActionResponseDto);
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

  it('delegates a manual question grant with the authenticated admin context', async () => {
    const request = { user: { id: 'admin-1' }, requestId: 'request-1' };

    await controller.grantQuestionAction(
      'question-1',
      'participant-1',
      request as never,
    );

    expect(service.grantQuestionAction).toHaveBeenCalledWith(
      'question-1',
      'participant-1',
      { actorAdminId: 'admin-1', requestId: 'request-1' },
    );
  });

  it('delegates the minimal participant search used by question grants', async () => {
    const query = { page: 1, limit: 20, search: 'Ana' };

    await controller.findQuestionGrantParticipants(query);

    expect(service.findQuestionGrantParticipants).toHaveBeenCalledWith(query);
  });
});
