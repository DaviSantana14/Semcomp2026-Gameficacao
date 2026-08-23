import { AdminController } from '../admin.controller';
import { AllowedOriginGuard } from '../../auth/allowed-origin.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';

describe(AdminController.name, () => {
  it('passes the status DTO and trusted admin context to the service', async () => {
    const participants = { updateStatus: jest.fn().mockResolvedValue({}) };
    const controller = new AdminController({} as never, participants as never);
    const dto = {
      isActive: false,
      reason: 'Desativacao operacional confirmada',
    };

    await controller.updateStatus('participant-1', dto, {
      user: { id: 'admin-1' },
      requestId: 'request-1',
    } as never);

    expect(participants.updateStatus).toHaveBeenCalledWith(
      'participant-1',
      dto,
      { actorAdminId: 'admin-1', requestId: 'request-1' },
    );
  });

  it('exposes the general-only password reset with origin protection', async () => {
    const participants = { resetPassword: jest.fn().mockResolvedValue({}) };
    const controller = new AdminController({} as never, participants as never);
    const dto = {
      reason: 'Participante solicitou suporte',
      replacePending: false,
    };

    await controller.resetPassword('participant-1', dto, {
      user: { id: 'admin-1' },
      requestId: 'request-1',
    } as never);

    expect(participants.resetPassword).toHaveBeenCalledWith(
      'participant-1',
      dto,
      { actorAdminId: 'admin-1', requestId: 'request-1' },
    );
    const resetPasswordHandler = Object.getOwnPropertyDescriptor(
      AdminController.prototype,
      'resetPassword',
    )?.value as object;
    expect(Reflect.getMetadata(GUARDS_METADATA, resetPasswordHandler)).toEqual([
      AllowedOriginGuard,
    ]);
  });
});
