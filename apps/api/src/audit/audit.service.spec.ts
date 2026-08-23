import {
  ActionRedemptionMethod,
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
        hasCode: true,
        codeChanged: false,
      },
      after: {
        id: 'action-1',
        name: 'Palestra atualizada',
        description: null,
        type: 'LECTURE',
        points: 20,
        isActive: true,
        isCodeActive: false,
        hasCode: true,
        codeChanged: true,
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
          hasCode: true,
          codeChanged: false,
        },
      }),
    );
  });

  it('rejects unsafe or duplicate point-event identifiers', async () => {
    const base = {
      actor: {
        actorType: AuditActorType.ADMIN as const,
        actorAdminId: 'admin-1',
        requestId: 'request-1',
      },
      operation: AuditOperation.RECONCILIATION_ADJUSTMENT_CONFIRMED,
      entityType: AuditEntityType.RECONCILIATION,
      entityId: 'participant-1',
      participantId: 'participant-1',
      reason: 'Correcao administrativa reconciliada',
      before: {
        participantId: 'participant-1',
        storedPoints: 10,
        storedXp: 10,
        ledgerPoints: 9,
        ledgerXp: 9,
        pointsDifference: 1,
        xpDifference: 1,
      },
      after: {
        participantId: 'participant-1',
        storedPoints: 10,
        storedXp: 10,
        ledgerPoints: 10,
        ledgerXp: 10,
        pointsDifference: 0,
        xpDifference: 0,
      },
    };

    for (const pointEventIds of [
      [],
      ['point-1', 'point-1'],
      ['point-1', 'secret value'],
    ]) {
      await expect(
        service.record(writer, {
          ...base,
          after: { ...base.after, pointEventIds },
          metadata: { pointEventIds },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(create).not.toHaveBeenCalled();
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
      before: {
        participantId: 'participant-1',
        storedPoints: 10,
        storedXp: 20,
        ledgerPoints: 9,
        ledgerXp: 18,
        pointsDifference: 1,
        xpDifference: 2,
      },
      after: {
        participantId: 'participant-1',
        storedPoints: 10,
        storedXp: 20,
        ledgerPoints: 10,
        ledgerXp: 20,
        pointsDifference: 0,
        xpDifference: 0,
        pointEventId: 'point-1',
      },
      metadata: { pointEventId: 'point-1' },
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: AuditActorType.SYSTEM,
        actorAdminId: null,
        // Jest asymmetric matchers are intentionally untyped inside mock calls.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        before: expect.objectContaining({
          storedPoints: 10,
          ledgerPoints: 9,
          pointsDifference: 1,
        }),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        after: expect.objectContaining({
          ledgerPoints: 10,
          pointEventId: 'point-1',
        }),
      }),
    );
  });

  it('requires and persists the minimal participant authorization facts for adjustments', async () => {
    await service.record(writer, {
      actor: {
        actorType: AuditActorType.ADMIN,
        actorAdminId: 'admin-1',
        requestId: 'request-1',
      },
      operation: AuditOperation.PARTICIPANT_BALANCE_ADJUSTED,
      entityType: AuditEntityType.POINT_EVENT,
      entityId: 'event-1',
      participantId: 'participant-1',
      reason: 'Correcao operacional confirmada',
      before: {
        participantId: 'participant-1',
        points: 10,
        xp: 5,
        role: 'PARTICIPANT',
        isActive: false,
      },
      after: {
        participantId: 'participant-1',
        points: 12,
        xp: 6,
        role: 'PARTICIPANT',
        isActive: false,
        pointEventId: 'event-1',
      },
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        before: {
          participantId: 'participant-1',
          points: 10,
          xp: 5,
          role: 'PARTICIPANT',
          isActive: false,
        },
      }),
    );

    await expect(
      service.record(writer, {
        actor: {
          actorType: AuditActorType.ADMIN,
          actorAdminId: 'admin-1',
          requestId: 'request-1',
        },
        operation: AuditOperation.PARTICIPANT_BALANCE_ADJUSTED,
        entityType: AuditEntityType.POINT_EVENT,
        entityId: 'event-2',
        participantId: 'participant-1',
        reason: 'Correcao operacional confirmada',
        before: { participantId: 'participant-1', points: 10, xp: 5 },
        after: {
          participantId: 'participant-1',
          points: 12,
          xp: 6,
          pointEventId: 'event-2',
        },
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
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
      after: {
        requestedQuantity: 2,
        createdQuantity: 2,
        redemptionMethod: ActionRedemptionMethod.CLAIM_CODE,
        actionId: 'action-1',
      },
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
          requestedQuantity: 2,
          createdQuantity: 2,
          redemptionMethod: ActionRedemptionMethod.CLAIM_CODE,
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

  it('accepts only aggregate facts for bulk status audit snapshots', async () => {
    await service.record(writer, {
      actor: {
        actorType: AuditActorType.ADMIN,
        actorAdminId: 'admin-1',
        requestId: 'request-1',
      },
      operation: AuditOperation.CLAIM_CODE_BULK_STATUS_CHANGED,
      entityType: AuditEntityType.CLAIM_CODE_BULK_OPERATION,
      entityId: 'bulk-1',
      reason: 'Desativacao preventiva do lote selecionado',
      after: {
        targetIsActive: false,
        selectedCount: 4,
        changedCount: 2,
        unchangedCount: 1,
        usedCount: 1,
        notFoundCount: 0,
      },
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        after: {
          targetIsActive: false,
          selectedCount: 4,
          changedCount: 2,
          unchangedCount: 1,
          usedCount: 1,
          notFoundCount: 0,
        },
      }),
    );

    await expect(
      service.record(writer, {
        actor: {
          actorType: AuditActorType.ADMIN,
          actorAdminId: 'admin-1',
          requestId: 'request-2',
        },
        operation: AuditOperation.CLAIM_CODE_BULK_STATUS_CHANGED,
        entityType: AuditEntityType.CLAIM_CODE_BULK_OPERATION,
        entityId: 'bulk-2',
        reason: 'Desativacao preventiva do lote selecionado',
        after: {
          targetIsActive: false,
          selectedCount: 1,
          changedCount: 1,
          unchangedCount: 0,
          usedCount: 0,
          notFoundCount: 0,
          selectedIds: ['claim-1'],
          maskedCode: 'AB****YZ',
        },
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ActionRedemptionMethod.DIRECT,
    ActionRedemptionMethod.REUSABLE_CODE,
  ])(
    'rejects an incompatible claim-code batch redemption method: %s',
    async (redemptionMethod) => {
      // Deliberately exercises the runtime boundary with untyped input.
      const input: any = {
        actor: {
          actorType: AuditActorType.ADMIN,
          actorAdminId: 'admin-1',
          requestId: 'request-1',
        },
        operation: AuditOperation.CLAIM_CODE_BATCH_GENERATED,
        entityType: AuditEntityType.CLAIM_CODE_BATCH,
        entityId: 'batch-1',
        reason: 'Geracao de lote para atividade',
        after: {
          requestedQuantity: 2,
          createdQuantity: 2,
          redemptionMethod,
          actionId: 'action-1',
        },
      };
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        service.record(writer, input),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(create).not.toHaveBeenCalled();
    },
  );

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

  it('persists only a pre-masked claim code representation', async () => {
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
        maskedCode: 'AB********56',
      },
      after: {
        id: 'code-1',
        isActive: false,
        isUsed: false,
        maskedCode: 'AB********56',
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

  it.each(['SECRET-CODE*', 'A*CDEF123456', 'AB**56*'])(
    'rejects a non-canonical claim-code mask: %s',
    async (maskedCode) => {
      await expect(
        service.record(writer, {
          actor: {
            actorType: AuditActorType.ADMIN,
            actorAdminId: 'admin-1',
            requestId: 'request-1',
          },
          operation: AuditOperation.CLAIM_CODE_STATUS_CHANGED,
          entityType: AuditEntityType.CLAIM_CODE,
          entityId: 'code-1',
          reason: 'Desativacao solicitada pelo suporte',
          before: { id: 'code-1', isActive: true, isUsed: false, maskedCode },
          after: { id: 'code-1', isActive: false, isUsed: false, maskedCode },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(create).not.toHaveBeenCalled();
    },
  );

  it.each(['*', '****', 'AB*56', 'AB********56'])(
    'accepts a canonical short or long claim-code mask: %s',
    async (maskedCode) => {
      await expect(
        service.record(writer, {
          actor: {
            actorType: AuditActorType.ADMIN,
            actorAdminId: 'admin-1',
            requestId: 'request-1',
          },
          operation: AuditOperation.CLAIM_CODE_STATUS_CHANGED,
          entityType: AuditEntityType.CLAIM_CODE,
          entityId: 'code-1',
          reason: 'Desativacao solicitada pelo suporte',
          before: { id: 'code-1', isActive: true, isUsed: false, maskedCode },
          after: { id: 'code-1', isActive: false, isUsed: false, maskedCode },
        }),
      ).resolves.toBeDefined();
    },
  );

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
            actorDisplayName: 'Sistema',
            actorDisplayEmail: null,
            participantId: null,
            participantDisplayName: null,
            participantDisplayEmail: null,
            operation: AuditOperation.RECONCILIATION_ADJUSTMENT_CONFIRMED,
            entityType: AuditEntityType.RECONCILIATION,
            entityId: 'reconciliation-1',
            entityDisplayName: 'Reconciliação reconciliation-1',
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
      actorSearch: '  sistema  ',
      participantSearch: '  grace  ',
      entitySearch: '  reconciliação  ',
      from: '2026-07-01T00:00:00.000Z',
    });

    expect(repository.findPage).toHaveBeenCalledWith(
      expect.objectContaining({
        participantId: 'participant-1',
        actorSearch: 'sistema',
        participantSearch: 'grace',
        entitySearch: 'reconciliação',
        from: new Date('2026-07-01T00:00:00.000Z'),
      }),
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        before: { points: 1 },
        after: { points: 2 },
        metadata: { pointEventId: 'point-1' },
        actorDisplay: { name: 'Sistema', email: null },
        participantDisplay: null,
        entityDisplay: { name: 'Reconciliação reconciliation-1' },
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
      accept({
        actor: { actorType: AuditActorType.SYSTEM, requestId: 'request-1' },
        operation: AuditOperation.CLAIM_CODE_BATCH_GENERATED,
        entityType: AuditEntityType.CLAIM_CODE_BATCH,
        entityId: 'batch-1',
        reason: 'Geracao de lote para atividade',
        after: {
          requestedQuantity: 1,
          createdQuantity: 1,
          // @ts-expect-error claim-code batches only support CLAIM_CODE
          redemptionMethod: ActionRedemptionMethod.DIRECT,
          actionId: 'action-1',
        },
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
