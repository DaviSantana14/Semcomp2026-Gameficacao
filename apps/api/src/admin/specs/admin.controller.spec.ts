import { AdminController } from '../admin.controller';

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
});
