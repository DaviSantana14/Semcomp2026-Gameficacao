import {
  AuditActorType,
  AuditEntityType,
  AuditOperation,
} from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { AuditService, RecordAuditEventInput } from './audit.service';

describe(AuditService.name, () => {
  const create = jest.fn();
  const writer = { create };
  let service: AuditService;

  beforeEach(() => {
    jest.clearAllMocks();
    create.mockImplementation((data: unknown) => Promise.resolve(data));
    service = new AuditService({ findPage: jest.fn() } as never);
  });

  it('writes an ADMIN event with a normalized reason and safe action snapshots', async () => {
    await service.record(writer, {
      actor: {
        actorType: AuditActorType.ADMIN,
        actorAdminId: 'admin-1',
        requestId: 'request-1',
      },
      operation: AuditOperation.ACTION_UPDATED,
      entityType: AuditEntityType.ACTION,
      entityId: 'action-1',
      reason: '   Atualização administrativa necessária   ',
      before: {
        id: 'action-1',
        name: 'Palestra',
        description: null,
        type: 'LECTURE',
        points: 10,
        isActive: true,
        isCodeActive: false,
      },
      after: {
        id: 'action-1',
        name: 'Palestra atualizada',
        description: null,
        type: 'LECTURE',
        points: 20,
        isActive: true,
        isCodeActive: false,
      },
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: AuditActorType.ADMIN,
        actorAdminId: 'admin-1',
        requestId: 'request-1',
        reason: 'Atualização administrativa necessária',
        before: {
          id: 'action-1',
          name: 'Palestra',
          description: null,
          type: 'LECTURE',
          points: 10,
          isActive: true,
          isCodeActive: false,
        },
      }),
    );
  });

  it('writes a SYSTEM event without an administrator', async () => {
    await service.record(writer, {
      actor: {
        actorType: AuditActorType.SYSTEM,
        requestId: 'system-job-1',
      },
      operation: AuditOperation.RECONCILIATION_ADJUSTMENT_CONFIRMED,
      entityType: AuditEntityType.RECONCILIATION,
      entityId: 'reconciliation-1',
      participantId: 'participant-1',
      reason: 'Correção automática reconciliada',
      before: { participantId: 'participant-1', points: 9, xp: 18 },
      after: { participantId: 'participant-1', points: 10, xp: 20 },
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: AuditActorType.SYSTEM,
        actorAdminId: null,
      }),
    );
  });

  it('keeps optional snapshots absent and allowlists metadata', async () => {
    await service.record(writer, {
      actor: {
        actorType: AuditActorType.ADMIN,
        actorAdminId: 'admin-1',
        requestId: 'request-1',
      },
      operation: AuditOperation.CLAIM_CODE_BATCH_GENERATED,
      entityType: AuditEntityType.CLAIM_CODE_BATCH,
      entityId: 'batch-1',
      reason: 'Geração de lote para atividade',
      after: { quantity: 2, type: 'SINGLE_USE', actionId: 'action-1' },
      metadata: {
        actionId: 'action-1',
        batchSize: 2,
        claimCodeIds: ['code-1', 'code-2'],
        rawCodes: ['SECRET-1', 'SECRET-2'],
        headers: { authorization: 'secret' },
      } as never,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        before: undefined,
        after: {
          quantity: 2,
          type: 'SINGLE_USE',
          actionId: 'action-1',
        },
        metadata: {
          actionId: 'action-1',
          batchSize: 2,
          claimCodeIds: ['code-1', 'code-2'],
        },
      }),
    );
  });

  it('accepts an explicit null previous snapshot for a creation', async () => {
    await service.record(writer, {
      actor: {
        actorType: AuditActorType.ADMIN,
        actorAdminId: 'admin-1',
        requestId: 'request-1',
      },
      operation: AuditOperation.ACTION_CREATED,
      entityType: AuditEntityType.ACTION,
      entityId: 'action-1',
      reason: 'Criação administrativa necessária',
      before: null,
      after: {
        id: 'action-1',
        name: 'Palestra',
        description: null,
        type: 'LECTURE',
        points: 10,
        isActive: true,
        isCodeActive: false,
      },
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ before: undefined }),
    );
  });

  it('masks a claim code value before persistence', async () => {
    await service.record(writer, {
      actor: {
        actorType: AuditActorType.ADMIN,
        actorAdminId: 'admin-1',
        requestId: 'request-1',
      },
      operation: AuditOperation.CLAIM_CODE_STATUS_CHANGED,
      entityType: AuditEntityType.CLAIM_CODE,
      entityId: 'code-1',
      reason: 'Desativação solicitada pelo suporte',
      before: {
        id: 'code-1',
        isActive: true,
        isUsed: false,
        code: 'ABCDEF123456',
      },
      after: {
        id: 'code-1',
        isActive: false,
        isUsed: false,
        code: 'ABCDEF123456',
      },
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        before: {
          id: 'code-1',
          isActive: true,
          isUsed: false,
          maskedCode: 'AB********56',
        },
      }),
    );
    expect(JSON.stringify(create.mock.calls[0])).not.toContain('ABCDEF123456');
  });

  it('lists persisted snapshots with database filters and pagination', async () => {
    const createdAt = new Date('2026-07-14T12:00:00.000Z');
    const repository = {
      findPage: jest.fn().mockResolvedValue({
        total: 1,
        rows: [
          {
            id: 'audit-1',
            actorType: AuditActorType.SYSTEM,
            actorAdminId: null,
            participantId: null,
            operation: AuditOperation.RECONCILIATION_ADJUSTMENT_CONFIRMED,
            entityType: AuditEntityType.RECONCILIATION,
            entityId: 'reconciliation-1',
            reason: 'Correção automática reconciliada',
            before: { points: 1 },
            after: { points: 2 },
            metadata: { pointEventId: 'point-1' },
            requestId: 'request-1',
            createdAt,
          },
        ],
      }),
    };
    service = new AuditService(repository as never);

    const result = await service.listGlobal({
      page: 1,
      limit: 20,
      participantId: 'participant-1',
      from: '2026-07-01T00:00:00.000Z',
    });

    expect(repository.findPage).toHaveBeenCalledWith(
      expect.objectContaining({
        participantId: 'participant-1',
        from: new Date('2026-07-01T00:00:00.000Z'),
      }),
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        before: { points: 1 },
        after: { points: 2 },
        metadata: { pointEventId: 'point-1' },
        createdAt: createdAt.toISOString(),
      }),
    );
  });

  it('rejects an inverted date interval before querying', async () => {
    const repository = { findPage: jest.fn() };
    service = new AuditService(repository as never);
    await expect(
      service.listGlobal({
        page: 1,
        limit: 20,
        from: '2026-07-14T00:00:00.000Z',
        to: '2026-07-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.findPage).not.toHaveBeenCalled();
  });

  it.each([
    {
      actorType: AuditActorType.ADMIN,
      requestId: 'request-1',
    },
    {
      actorType: AuditActorType.SYSTEM,
      actorAdminId: 'admin-1',
      requestId: 'request-1',
    },
    {
      actorType: AuditActorType.SYSTEM,
      requestId: '',
    },
  ])('rejects incomplete or contradictory actor context %#', async (actor) => {
    await expect(
      service.record(writer, {
        actor: actor as never,
        operation: AuditOperation.PARTICIPANT_STATUS_CHANGED,
        entityType: AuditEntityType.PARTICIPANT,
        entityId: 'participant-1',
        participantId: 'participant-1',
        reason: 'Alteração administrativa necessária',
        before: { isActive: true },
        after: { isActive: false },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a participant operation without participantId', async () => {
    await expect(
      service.record(writer, {
        actor: {
          actorType: AuditActorType.ADMIN,
          actorAdminId: 'admin-1',
          requestId: 'request-1',
        },
        operation: AuditOperation.PARTICIPANT_STATUS_CHANGED,
        entityType: AuditEntityType.PARTICIPANT,
        entityId: 'participant-1',
        reason: 'Alteração administrativa necessária',
        before: { isActive: true },
        after: { isActive: false },
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a redemption operation without participantId', async () => {
    await expect(
      service.record(writer, {
        actor: {
          actorType: AuditActorType.ADMIN,
          actorAdminId: 'admin-1',
          requestId: 'request-1',
        },
        operation: AuditOperation.REWARD_REDEMPTION_DELIVERED,
        entityType: AuditEntityType.REWARD_REDEMPTION,
        entityId: 'redemption-1',
        reason: 'Entrega confirmada pelo administrador',
        before: { id: 'redemption-1', status: 'PENDING' },
        after: { id: 'redemption-1', status: 'DELIVERED' },
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a delivered redemption snapshot without delivery facts', async () => {
    await expect(
      service.record(writer, {
        actor: {
          actorType: AuditActorType.ADMIN,
          actorAdminId: 'admin-1',
          requestId: 'request-1',
        },
        participantId: 'participant-1',
        operation: AuditOperation.REWARD_REDEMPTION_DELIVERED,
        entityType: AuditEntityType.REWARD_REDEMPTION,
        entityId: 'redemption-1',
        reason: 'Entrega confirmada pelo administrador',
        before: {
          id: 'redemption-1',
          status: 'PENDING',
          deliveredAt: null,
          deliveredByAdminId: null,
        },
        after: { id: 'redemption-1', status: 'DELIVERED' },
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects an operation and entity type mismatch', async () => {
    await expect(
      service.record(writer, {
        actor: {
          actorType: AuditActorType.ADMIN,
          actorAdminId: 'admin-1',
          requestId: 'request-1',
        },
        operation: AuditOperation.ACTION_UPDATED,
        entityType: AuditEntityType.REWARD,
        entityId: 'action-1',
        reason: 'Atualização administrativa necessária',
        before: {
          id: 'action-1',
          name: 'Palestra',
          description: null,
          type: 'LECTURE',
          points: 10,
          isActive: true,
          isCodeActive: false,
        },
        after: {
          id: 'action-1',
          name: 'Palestra',
          description: null,
          type: 'LECTURE',
          points: 20,
          isActive: true,
          isCodeActive: false,
        },
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a full entity at an any boundary instead of silently transforming it', async () => {
    await expect(
      service.record(writer, {
        actor: {
          actorType: AuditActorType.ADMIN,
          actorAdminId: 'admin-1',
          requestId: 'request-1',
        },
        operation: AuditOperation.ACTION_UPDATED,
        entityType: AuditEntityType.ACTION,
        entityId: 'action-1',
        reason: 'Atualização administrativa necessária',
        before: {
          id: 'action-1',
          name: 'Palestra',
          description: null,
          type: 'LECTURE',
          points: 10,
          isActive: true,
          isCodeActive: false,
          createdAt: new Date(),
          passwordHash: 'proibido',
        },
        after: {
          id: 'action-1',
          name: 'Palestra',
          description: null,
          type: 'LECTURE',
          points: 20,
          isActive: true,
          isCodeActive: false,
        },
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('exposes operation-discriminated compile-time contracts', () => {
    const verifyCompileTimeContracts = () => {
      const accept = (input: RecordAuditEventInput) => input;
      // @ts-expect-error participant operations require participantId
      accept({
        actor: { actorType: AuditActorType.SYSTEM, requestId: 'request-1' },
        operation: AuditOperation.PARTICIPANT_STATUS_CHANGED,
        entityType: AuditEntityType.PARTICIPANT,
        entityId: 'participant-1',
        reason: 'Alteração administrativa necessária',
        before: { isActive: true },
        after: { isActive: false },
      });
      // @ts-expect-error operation and entityType must be compatible
      accept({
        actor: { actorType: AuditActorType.SYSTEM, requestId: 'request-1' },
        operation: AuditOperation.ACTION_UPDATED,
        entityType: AuditEntityType.REWARD,
        entityId: 'action-1',
        reason: 'Atualização administrativa necessária',
        before: {
          id: 'action-1',
          name: 'Palestra',
          description: null,
          type: 'LECTURE',
          points: 10,
          isActive: true,
          isCodeActive: false,
        },
        after: {
          id: 'action-1',
          name: 'Palestra',
          description: null,
          type: 'LECTURE',
          points: 20,
          isActive: true,
          isCodeActive: false,
        },
      });
      accept({
        actor: { actorType: AuditActorType.SYSTEM, requestId: 'request-1' },
        operation: AuditOperation.ACTION_UPDATED,
        entityType: AuditEntityType.ACTION,
        entityId: 'action-1',
        reason: 'Atualização administrativa necessária',
        before: {
          id: 'action-1',
          name: 'Palestra',
          description: null,
          type: 'LECTURE',
          points: 10,
          isActive: true,
          isCodeActive: false,
          // @ts-expect-error full entity fields require explicit transformation
          createdAt: new Date(),
        },
        after: {
          id: 'action-1',
          name: 'Palestra',
          description: null,
          type: 'LECTURE',
          points: 20,
          isActive: true,
          isCodeActive: false,
        },
      });
    };
    expect(verifyCompileTimeContracts).toBeDefined();
  });
});
