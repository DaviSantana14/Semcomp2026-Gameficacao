import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuditController } from './audit.controller';
import { ADMIN_PROFILES_KEY } from '../auth/admin-profiles.decorator';
import { AdminProfilesGuard } from '../auth/admin-profiles.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CsrfGuard } from '../auth/csrf.guard';

describe(AuditController.name, () => {
  const service = {
    listGlobal: jest.fn(),
    listParticipant: jest.fn(),
  };
  const controller = new AuditController(service as never);

  beforeEach(() => jest.clearAllMocks());

  it('delegates global filters to the service', async () => {
    const query = { page: 2, limit: 10 };
    service.listGlobal.mockResolvedValue({ items: [], meta: {} });
    await expect(controller.findAll(query as never)).resolves.toEqual({
      items: [],
      meta: {},
    });
    expect(service.listGlobal).toHaveBeenCalledWith(query);
  });

  it('forces the route participant id into participant queries', async () => {
    const query = { page: 1, limit: 20 };
    service.listParticipant.mockResolvedValue({ items: [], meta: {} });
    await controller.findParticipant('participant-1', query);
    expect(service.listParticipant).toHaveBeenCalledWith(
      'participant-1',
      query,
    );
  });

  it('requires JWT, CSRF semantics and the general profile', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AuditController,
    ) as unknown[];
    expect(guards).toEqual([JwtAuthGuard, CsrfGuard, AdminProfilesGuard]);
    expect(Reflect.getMetadata(ADMIN_PROFILES_KEY, AuditController)).toEqual([
      'GENERAL',
    ]);
  });

  it('does not expose update or delete handlers', () => {
    expect(Object.getOwnPropertyNames(AuditController.prototype)).toEqual([
      'constructor',
      'findAll',
      'findParticipant',
    ]);
  });
});
