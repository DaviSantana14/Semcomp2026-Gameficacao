import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ActionType } from '@prisma/client';
import { PersistenceUniqueConstraintError } from '../../common/persistence-errors';
import { ActionsRepository } from '../actions.repository';
import { ActionsService } from '../actions.service';
import { AuditService } from '../../audit/audit.service';
import { AuditOperation } from '../../audit/audit.repository';

describe(ActionsService.name, () => {
  let service: ActionsService;
  let repository: jest.Mocked<ActionsRepository>;
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    const repositoryMock = {
      auditWriter: { create: jest.fn() },
      createAction: jest.fn(),
      findActionCodeState: jest.fn(),
      updateAction: jest.fn(),
      withTransaction: jest.fn(),
    };
    repositoryMock.withTransaction.mockImplementation(
      // Mock callback types are intentionally structural in this unit boundary.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
      (callback) => callback(repositoryMock, {}),
    );
    audit = { record: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
    const module = await Test.createTestingModule({
      providers: [
        ActionsService,
        { provide: ActionsRepository, useValue: repositoryMock },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(ActionsService);
    repository = module.get(ActionsRepository);
  });

  it('normalizes reusable codes before persistence', async () => {
    repository.createAction.mockResolvedValue({ id: 'action-1' } as never);
    await service.create(
      {
        name: 'Check-in',
        type: ActionType.CHECKIN,
        code: ' dia1 ',
        points: 10,
        reason: 'Criacao operacional confirmada',
      },
      { actorAdminId: 'admin-1', requestId: 'request-1' },
    );
    expect(repository.createAction.mock.calls).toEqual([
      [expect.objectContaining({ code: 'DIA1', isCodeActive: true })],
    ]);
  });

  it('rejects claim-code-shaped reusable codes before persistence', async () => {
    await expect(
      service.create(
        {
          name: 'Check-in',
          type: ActionType.CHECKIN,
          code: 'ABCD-EFGH',
          points: 10,
          reason: 'Criacao operacional confirmada',
        },
        { actorAdminId: 'admin-1', requestId: 'request-1' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.createAction.mock.calls).toHaveLength(0);
  });

  it('maps neutral uniqueness errors to the existing HTTP conflict', async () => {
    repository.createAction.mockRejectedValue(
      new PersistenceUniqueConstraintError(),
    );
    await expect(
      service.create(
        {
          name: 'Check-in',
          type: ActionType.CHECKIN,
          code: 'DIA1',
          points: 10,
          reason: 'Criacao operacional confirmada',
        },
        { actorAdminId: 'admin-1', requestId: 'request-1' },
      ),
    ).rejects.toEqual(
      new ConflictException(
        'Já existe uma atividade pontuável com este código.',
      ),
    );
  });

  it('creates an action and its safe audit snapshot in one transaction', async () => {
    const created = {
      id: 'action-1',
      name: 'Check-in',
      description: null,
      type: ActionType.CHECKIN,
      code: 'SEGREDO',
      points: 10,
      isActive: true,
      isCodeActive: true,
      createdAt: new Date(),
    };
    const transactional = {
      auditWriter: { create: jest.fn() },
      createAction: jest.fn().mockResolvedValue(created),
    };
    repository.withTransaction.mockImplementation((callback) =>
      callback(transactional as never, {} as never),
    );

    await service.create(
      {
        name: 'Check-in',
        type: ActionType.CHECKIN,
        code: 'SEGREDO',
        points: 10,
        reason: 'Criacao operacional confirmada',
      },
      { actorAdminId: 'admin-1', requestId: 'request-1' },
    );

    expect(audit.record).toHaveBeenCalledWith(
      transactional.auditWriter,
      expect.objectContaining({
        operation: AuditOperation.ACTION_CREATED,
        before: null,
        after: {
          id: 'action-1',
          name: 'Check-in',
          description: null,
          type: ActionType.CHECKIN,
          points: 10,
          isActive: true,
          isCodeActive: true,
        },
        reason: 'Criacao operacional confirmada',
      }),
    );
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('SEGREDO');
  });

  it('uses status audit only when isActive is the sole effective change', async () => {
    const current = {
      id: 'action-1',
      name: 'Check-in',
      description: null,
      type: ActionType.CHECKIN,
      code: 'SEGREDO',
      points: 10,
      isActive: true,
      isCodeActive: true,
      createdAt: new Date(),
    };
    const updated = { ...current, isActive: false };
    const transactional = {
      auditWriter: { create: jest.fn() },
      findActionById: jest.fn().mockResolvedValue(current),
      updateAction: jest.fn().mockResolvedValue(updated),
    };
    repository.withTransaction.mockImplementation((callback) =>
      callback(transactional as never, {} as never),
    );

    await service.update(
      'action-1',
      { isActive: false, reason: 'Desativacao operacional confirmada' },
      { actorAdminId: 'admin-1', requestId: 'request-1' },
    );

    expect(audit.record).toHaveBeenCalledWith(
      transactional.auditWriter,
      expect.objectContaining({
        operation: AuditOperation.ACTION_STATUS_CHANGED,
        before: { isActive: true },
        after: { isActive: false },
      }),
    );
  });

  it('uses general update audit when another field changes with status', async () => {
    const current = {
      id: 'action-1',
      name: 'Check-in',
      description: null,
      type: ActionType.CHECKIN,
      code: null,
      points: 10,
      isActive: true,
      isCodeActive: false,
      createdAt: new Date(),
    };
    const updated = { ...current, name: 'Novo nome', isActive: false };
    const transactional = {
      auditWriter: { create: jest.fn() },
      findActionById: jest.fn().mockResolvedValue(current),
      updateAction: jest.fn().mockResolvedValue(updated),
    };
    repository.withTransaction.mockImplementation((callback) =>
      callback(transactional as never, {} as never),
    );

    await service.update(
      'action-1',
      {
        name: 'Novo nome',
        isActive: false,
        reason: 'Edicao operacional confirmada',
      },
      { actorAdminId: 'admin-1', requestId: 'request-1' },
    );

    expect(audit.record).toHaveBeenCalledWith(
      transactional.auditWriter,
      expect.objectContaining({ operation: AuditOperation.ACTION_UPDATED }),
    );
  });

  it('returns a no-op update without writing domain or audit records', async () => {
    const current = {
      id: 'action-1',
      name: 'Check-in',
      description: null,
      type: ActionType.CHECKIN,
      code: null,
      points: 10,
      isActive: true,
      isCodeActive: false,
      createdAt: new Date(),
    };
    const transactional = {
      auditWriter: { create: jest.fn() },
      findActionById: jest.fn().mockResolvedValue(current),
      updateAction: jest.fn(),
    };
    repository.withTransaction.mockImplementation((callback) =>
      callback(transactional as never, {} as never),
    );

    await expect(
      service.update(
        'action-1',
        { name: 'Check-in', reason: 'Revisao operacional confirmada' },
        { actorAdminId: 'admin-1', requestId: 'request-1' },
      ),
    ).resolves.toBe(current);
    expect(transactional.updateAction).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
