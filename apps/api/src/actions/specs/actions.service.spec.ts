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
  let audit: { record: jest.MockedFunction<AuditService['record']> };

  beforeEach(async () => {
    const repositoryMock = {
      auditWriter: { create: jest.fn() },
      createAction: jest.fn(),
      createActionPointEvent: jest.fn(),
      findActionCodeState: jest.fn(),
      findActionById: jest.fn(),
      findQuestionGrantParticipantPage: jest.fn(),
      lockActionById: jest.fn(),
      lockParticipantForQuestionGrant: jest.fn(),
      incrementUserProgress: jest.fn(),
      updateAction: jest.fn(),
      withTransaction: jest.fn(),
    };
    repositoryMock.withTransaction.mockImplementation(
      // Mock callback types are intentionally structural in this unit boundary.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
      (callback) => callback(repositoryMock, {}),
    );
    audit = {
      record: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    };
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

  it('grants an active question action to an active participant with audit context', async () => {
    const action = {
      id: 'question-1',
      name: 'Pergunta na palestra de IA',
      description: null,
      type: ActionType.QUESTION,
      code: null,
      points: 30,
      isActive: true,
      isCodeActive: false,
      createdAt: new Date('2026-08-25T12:00:00.000Z'),
    };
    const participant = {
      id: 'participant-1',
      points: 40,
      xp: 70,
      level: 2,
      role: 'PARTICIPANT',
      isActive: true,
    };
    repository.lockActionById.mockResolvedValue(action);
    repository.lockParticipantForQuestionGrant.mockResolvedValue(
      participant as never,
    );
    repository.createActionPointEvent.mockResolvedValue({
      id: 'point-event-1',
      xpDelta: 30,
    } as never);
    repository.incrementUserProgress.mockResolvedValue({
      id: participant.id,
      points: 70,
      xp: 100,
      level: 2,
    });

    const result = await service.grantQuestionAction(
      action.id,
      participant.id,
      {
        actorAdminId: 'admin-1',
        requestId: 'request-1',
      },
    );

    expect(result).toMatchObject({
      action: { id: action.id, name: action.name, points: 30 },
      participantId: participant.id,
      awardedPoints: 30,
      awardedXp: 30,
      currentPoints: 70,
      currentXp: 100,
    });

    expect(audit.record.mock.calls[0]?.[0]).toBe(repository.auditWriter);
    expect(audit.record.mock.calls[0]?.[1]).toMatchObject({
      participantId: participant.id,
      reason: 'Pergunta em palestra registrada manualmente pelo administrador.',
      before: { points: 40, xp: 70 },
      after: { points: 70, xp: 100 },
      metadata: { actionId: action.id },
    });
    expect(repository.createActionPointEvent.mock.calls[0]?.[0]).toMatchObject({
      userId: participant.id,
      actionId: action.id,
      points: 30,
      xpDelta: 30,
      redemptionMethod: 'DIRECT',
      actorAdminId: 'admin-1',
      auditEventId: 'audit-1',
    });
    expect(repository.createActionPointEvent.mock.calls[0]?.[0].createdAt).toBe(
      result.grantedAt,
    );
  });

  it('rejects manual grants for non-question actions', async () => {
    repository.lockActionById.mockResolvedValue({
      id: 'checkin-1',
      name: 'Check-in',
      description: null,
      type: ActionType.CHECKIN,
      code: null,
      points: 10,
      isActive: true,
      isCodeActive: false,
      createdAt: new Date(),
    });

    await expect(
      service.grantQuestionAction('checkin-1', 'participant-1', {
        actorAdminId: 'admin-1',
        requestId: 'request-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.createActionPointEvent.mock.calls).toHaveLength(0);
  });

  it('rejects manual grants for inactive participants', async () => {
    repository.lockActionById.mockResolvedValue({
      id: 'question-1',
      name: 'Pergunta',
      description: null,
      type: ActionType.QUESTION,
      code: null,
      points: 30,
      isActive: true,
      isCodeActive: false,
      createdAt: new Date(),
    });
    repository.lockParticipantForQuestionGrant.mockResolvedValue({
      id: 'participant-1',
      points: 0,
      xp: 0,
      level: 1,
      role: 'PARTICIPANT',
      isActive: false,
    } as never);

    await expect(
      service.grantQuestionAction('question-1', 'participant-1', {
        actorAdminId: 'admin-1',
        requestId: 'request-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.createActionPointEvent.mock.calls).toHaveLength(0);
  });

  it('maps duplicate action redemptions to a participant-specific conflict', async () => {
    repository.lockActionById.mockResolvedValue({
      id: 'question-1',
      name: 'Pergunta',
      description: null,
      type: ActionType.QUESTION,
      code: null,
      points: 30,
      isActive: true,
      isCodeActive: false,
      createdAt: new Date(),
    });
    repository.lockParticipantForQuestionGrant.mockResolvedValue({
      id: 'participant-1',
      points: 0,
      xp: 0,
      level: 1,
      role: 'PARTICIPANT',
      isActive: true,
    } as never);
    repository.createActionPointEvent.mockRejectedValue(
      new PersistenceUniqueConstraintError(),
    );

    await expect(
      service.grantQuestionAction('question-1', 'participant-1', {
        actorAdminId: 'admin-1',
        requestId: 'request-1',
      }),
    ).rejects.toEqual(
      new ConflictException(
        'Este participante já recebeu os pontos desta palestra.',
      ),
    );
    expect(repository.incrementUserProgress.mock.calls).toHaveLength(0);
  });

  it('returns only minimal participant data for the question-grant search', async () => {
    repository.findQuestionGrantParticipantPage.mockResolvedValue({
      rows: [
        {
          id: 'participant-1',
          name: 'Ana Silva',
          points: 40,
          isActive: true,
        },
      ],
      total: 1,
    });

    await expect(
      service.findQuestionGrantParticipants({
        page: 1,
        limit: 20,
        search: ' Ana ',
      }),
    ).resolves.toEqual({
      items: [
        {
          id: 'participant-1',
          name: 'Ana Silva',
          points: 40,
          isActive: true,
        },
      ],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    expect(repository.findQuestionGrantParticipantPage.mock.calls).toEqual([
      [{ page: 1, limit: 20, search: 'Ana' }],
    ]);
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
          hasCode: true,
          codeChanged: false,
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
      lockActionById: jest.fn().mockResolvedValue(current),
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
      lockActionById: jest.fn().mockResolvedValue(current),
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

  it.each([
    ['adds', null, 'NOVO-CODIGO', undefined],
    ['changes', 'CODIGO-ANTIGO', 'CODIGO-NOVO', undefined],
    ['removes', 'CODIGO-ANTIGO', null, undefined],
    ['changes with another field', 'CODIGO-ANTIGO', 'CODIGO-NOVO', 'Novo nome'],
  ] as const)(
    '%s a reusable code with distinguishable safe snapshots',
    async (_label, previousCode, nextCode, nextName) => {
      const current = {
        id: 'action-1',
        name: 'Check-in',
        description: null,
        type: ActionType.CHECKIN,
        code: previousCode,
        points: 10,
        isActive: true,
        isCodeActive: previousCode !== null,
        createdAt: new Date(),
      };
      const updated = {
        ...current,
        ...(nextName ? { name: nextName } : {}),
        code: nextCode,
        isCodeActive: nextCode !== null,
      };
      const transactional = {
        auditWriter: { create: jest.fn() },
        lockActionById: jest.fn().mockResolvedValue(current),
        updateAction: jest.fn().mockResolvedValue(updated),
      };
      repository.withTransaction.mockImplementation((callback) =>
        callback(transactional as never, {} as never),
      );

      await service.update(
        'action-1',
        {
          code: nextCode,
          ...(nextName ? { name: nextName } : {}),
          reason: 'Rotacao segura do codigo operacional',
        },
        { actorAdminId: 'admin-1', requestId: 'request-1' },
      );

      const auditInput = audit.record.mock.calls[0]?.[1];
      expect(auditInput).toMatchObject({
        operation: AuditOperation.ACTION_UPDATED,
        before: { hasCode: previousCode !== null, codeChanged: false },
        after: { hasCode: nextCode !== null, codeChanged: true },
      });
      const serialized = JSON.stringify(auditInput);
      if (previousCode) expect(serialized).not.toContain(previousCode);
      if (nextCode) expect(serialized).not.toContain(nextCode);
    },
  );

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
      lockActionById: jest.fn().mockResolvedValue(current),
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

  it('rolls back action creation when the audit writer fails', async () => {
    const failure = new Error('audit writer failed');
    const state: {
      actions: Array<{ id: string; name: string }>;
      audits: number;
    } = {
      actions: [],
      audits: 0,
    };
    const transactional = {
      auditWriter: { create: jest.fn() },
      createAction: jest.fn((input: { name: string }) => {
        const action = {
          id: 'action-rollback-create',
          description: null,
          type: ActionType.CHECKIN,
          code: null,
          points: 10,
          isActive: true,
          isCodeActive: false,
          createdAt: new Date(),
          ...input,
        };
        state.actions.push({ id: action.id, name: action.name });
        return Promise.resolve(action);
      }),
    };
    audit.record.mockRejectedValue(failure);
    repository.withTransaction.mockImplementation(async (callback) => {
      const before = [...state.actions];
      try {
        return await callback(transactional as never, {} as never);
      } catch (error) {
        state.actions.splice(0, state.actions.length, ...before);
        throw error;
      }
    });

    await expect(
      service.create(
        {
          name: 'Check-in',
          type: ActionType.CHECKIN,
          points: 10,
          reason: 'Criacao operacional confirmada',
        },
        { actorAdminId: 'admin-1', requestId: 'request-1' },
      ),
    ).rejects.toBe(failure);

    expect(state).toEqual({ actions: [], audits: 0 });
  });

  it('rolls back action editing when the audit writer fails', async () => {
    const failure = new Error('audit writer failed');
    const original = {
      id: 'action-rollback-update',
      name: 'Check-in',
      description: null,
      type: ActionType.CHECKIN,
      code: null,
      points: 10,
      isActive: true,
      isCodeActive: false,
      createdAt: new Date(),
    };
    const state = { action: { ...original }, audits: 0 };
    const transactional = {
      auditWriter: { create: jest.fn() },
      lockActionById: jest.fn(() => Promise.resolve({ ...state.action })),
      updateAction: jest.fn((_id: string, input: { name?: string }) => {
        state.action = { ...state.action, ...input };
        return Promise.resolve({ ...state.action });
      }),
    };
    audit.record.mockRejectedValue(failure);
    repository.withTransaction.mockImplementation(async (callback) => {
      const before = { ...state.action };
      try {
        return await callback(transactional as never, {} as never);
      } catch (error) {
        state.action = before;
        throw error;
      }
    });

    await expect(
      service.update(
        original.id,
        { name: 'Credenciamento', reason: 'Edicao operacional confirmada' },
        { actorAdminId: 'admin-1', requestId: 'request-1' },
      ),
    ).rejects.toBe(failure);

    expect(state).toEqual({ action: original, audits: 0 });
  });
});
