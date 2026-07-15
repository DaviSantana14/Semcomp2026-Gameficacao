import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  AuditEntityType,
  AuditOperation,
  PointEventKind,
  PointEventSource,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import { TransactionAuditWriter } from '../../audit/audit.repository';
import { AuditService } from '../../audit/audit.service';
import {
  AdminReconciliationRepository,
  ReconciliationTransaction,
} from '../admin-reconciliation.repository';
import { AdminReconciliationService } from '../admin-reconciliation.service';
import { ReconciliationFilter } from '../dto/list-reconciliation.dto';

describe(AdminReconciliationService.name, () => {
  const repository = {
    findPage: jest.fn(),
    findByParticipantId: jest.fn(),
    countDivergent: jest.fn(),
    withTransaction: jest.fn(),
    findByIdempotencyKey: jest.fn(),
  };
  const audit = { record: jest.fn() };
  let service: AdminReconciliationService;
  const useTransaction = (
    transaction: ReturnType<typeof reconciliationTransaction>,
  ) => {
    repository.withTransaction.mockImplementation(
      (callback: (value: ReconciliationTransaction) => Promise<unknown>) =>
        callback(transaction as never),
    );
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AdminReconciliationService,
        { provide: AdminReconciliationRepository, useValue: repository },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(AdminReconciliationService);
  });

  it('confirms a divergence with an audited ledger-only compensation', async () => {
    const transaction = reconciliationTransaction();
    useTransaction(transaction);
    audit.record.mockResolvedValue(auditEvent());
    transaction.createPointEvent.mockResolvedValue(pointEvent());

    const result = await service.confirm('participant-1', confirmation(), {
      actorAdminId: 'admin-1',
      requestId: 'request-1',
    });

    expect(transaction.updateParticipantBalance).toBeUndefined();
    expect(transaction.createPointEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'participant-1',
        points: 2,
        xpDelta: 4,
        kind: PointEventKind.CREDIT,
        source: PointEventSource.ADMIN_ADJUST,
        actorAdminId: 'admin-1',
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      transaction.auditWriter,
      expect.objectContaining({
        operation: AuditOperation.RECONCILIATION_ADJUSTMENT_CONFIRMED,
        entityType: AuditEntityType.RECONCILIATION,
        participantId: 'participant-1',
        reason: 'Correcao operacional confirmada',
      }),
    );
    expect(result).toMatchObject({
      before: { pointsDifference: 2, xpDifference: 4, status: 'DIVERGENT' },
      after: { pointsDifference: 0, xpDifference: 0, status: 'CONSISTENT' },
      pointEvent: {
        source: PointEventSource.ADMIN_ADJUST,
        origin: 'RECONCILIATION_COMPENSATION',
        pointsDelta: 2,
        xpDelta: 4,
      },
      auditEvent: {
        operation: AuditOperation.RECONCILIATION_ADJUSTMENT_CONFIRMED,
      },
      replayed: false,
    });
  });

  it('persists safe snapshots through the real AuditService for opposite-signed compensation', async () => {
    const transaction = reconciliationTransaction({
      ledgerPoints: 15,
      ledgerXp: 6,
    });
    const createAudit: jest.MockedFunction<TransactionAuditWriter['create']> =
      jest.fn().mockResolvedValue(auditEvent());
    transaction.auditWriter = { create: createAudit };
    repository.withTransaction.mockImplementation(
      (callback: (value: ReconciliationTransaction) => Promise<unknown>) =>
        callback(transaction as never),
    );
    transaction.createPointEvent.mockResolvedValue(
      pointEvent({ points: -5, xpDelta: 4, kind: PointEventKind.DEBIT }),
    );
    service = new AdminReconciliationService(
      repository as never,
      new AuditService({ findPage: jest.fn() } as never),
    );

    await expect(
      service.confirm('participant-1', confirmation(), {
        actorAdminId: 'admin-1',
        requestId: 'request-1',
      }),
    ).resolves.toMatchObject({
      before: { pointsDifference: -5, xpDifference: 4 },
      pointEvent: { pointsDelta: -5, xpDelta: 4, kind: PointEventKind.DEBIT },
    });
    const persisted = createAudit.mock.calls[0]?.[0];
    expect(persisted).toBeDefined();
    expect(persisted?.before).toEqual(
      expect.objectContaining({ pointsDifference: -5, xpDifference: 4 }),
    );
    expect(persisted?.after).toEqual(
      expect.objectContaining({ pointsDifference: 0, xpDifference: 0 }),
    );
    expect(persisted?.before).not.toHaveProperty('status');
    expect(persisted?.after).not.toHaveProperty('status');
    expect(transaction.createPointEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        points: -5,
        xpDelta: 4,
        kind: PointEventKind.DEBIT,
      }),
    );
  });

  it('returns the original result for an identical idempotent replay', async () => {
    const transaction = reconciliationTransaction({ existing: pointEvent() });
    useTransaction(transaction);

    await expect(
      service.confirm('participant-1', confirmation(), {
        actorAdminId: 'admin-1',
        requestId: 'retry-request',
      }),
    ).resolves.toMatchObject({ replayed: true, pointEvent: { id: 'point-1' } });
    expect(transaction.createPointEvent).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('rejects conflicting idempotency key reuse', async () => {
    const transaction = reconciliationTransaction({
      existing: pointEvent({ description: 'Outro motivo operacional' }),
    });
    useTransaction(transaction);

    await expect(
      service.confirm('participant-1', confirmation(), {
        actorAdminId: 'admin-1',
        requestId: 'request-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects confirmation when the participant is already consistent', async () => {
    const transaction = reconciliationTransaction({
      ledgerPoints: 10,
      ledgerXp: 10,
    });
    useTransaction(transaction);

    await expect(
      service.confirm('participant-1', confirmation(), {
        actorAdminId: 'admin-1',
        requestId: 'request-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('does not create a ledger event when auditing fails', async () => {
    const transaction = reconciliationTransaction();
    useTransaction(transaction);
    audit.record.mockRejectedValue(new Error('audit failed'));

    await expect(
      service.confirm('participant-1', confirmation(), {
        actorAdminId: 'admin-1',
        requestId: 'request-1',
      }),
    ).rejects.toThrow('audit failed');
    expect(transaction.createPointEvent).not.toHaveBeenCalled();
  });

  it('returns a paginated list with explicit differences and ISO dates', async () => {
    repository.findPage.mockResolvedValue({
      total: 1,
      rows: [row({ ledgerPoints: 8, ledgerXp: 10 })],
    });

    await expect(
      service.findAll({
        page: 2,
        limit: 5,
        search: 'Ana',
        filter: ReconciliationFilter.DIVERGENT,
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          participantId: 'participant-1',
          storedPoints: 10,
          ledgerPoints: 8,
          pointsDifference: 2,
          storedXp: 10,
          ledgerXp: 10,
          xpDifference: 0,
          status: 'DIVERGENT',
          lastEventAt: '2026-07-14T12:00:00.000Z',
        }),
      ],
      meta: { page: 2, limit: 5, total: 1, totalPages: 1 },
    });
    expect(repository.findPage).toHaveBeenCalledWith({
      page: 2,
      limit: 5,
      search: 'Ana',
      divergentOnly: true,
    });
  });

  it('reports a participant without events as consistent when stored balances are zero', async () => {
    repository.findByParticipantId.mockResolvedValue(
      row({
        storedPoints: 0,
        storedXp: 0,
        ledgerPoints: 0,
        ledgerXp: 0,
        lastEventAt: null,
      }),
    );

    await expect(service.findOne('participant-1')).resolves.toMatchObject({
      pointsDifference: 0,
      xpDifference: 0,
      status: 'CONSISTENT',
      lastEventAt: null,
    });
  });

  it('distinguishes points-only, XP-only and combined divergences', async () => {
    for (const [ledgerPoints, ledgerXp, expected] of [
      [9, 10, [1, 0]],
      [10, 8, [0, 2]],
      [7, 6, [3, 4]],
    ] as const) {
      repository.findByParticipantId.mockResolvedValueOnce(
        row({ ledgerPoints, ledgerXp }),
      );
      const result = await service.findOne('participant-1');
      expect([result.pointsDifference, result.xpDifference]).toEqual(expected);
      expect(result.status).toBe('DIVERGENT');
    }
  });

  it('returns the shared divergent participant summary', async () => {
    repository.countDivergent.mockResolvedValue(7);
    await expect(service.getSummary()).resolves.toEqual({
      divergentParticipants: 7,
    });
  });

  it('returns 404 when the participant does not exist', async () => {
    repository.findByParticipantId.mockResolvedValue(null);
    await expect(service.findOne('missing')).rejects.toEqual(
      new NotFoundException('Participante não encontrado.'),
    );
  });
});

function row(overrides: Record<string, unknown> = {}) {
  return {
    participantId: 'participant-1',
    name: 'Ana',
    email: 'ana@example.test',
    storedPoints: 10,
    storedXp: 10,
    ledgerPoints: 10,
    ledgerXp: 10,
    lastEventAt: new Date('2026-07-14T12:00:00.000Z'),
    ...overrides,
  };
}

function confirmation() {
  return {
    reason: '  Correcao operacional confirmada  ',
    idempotencyKey: '5c5b4dc4-1a47-4cc3-a758-fbeec37e92d8',
  };
}

function auditEvent() {
  return {
    id: 'audit-1',
    operation: AuditOperation.RECONCILIATION_ADJUSTMENT_CONFIRMED,
    reason: 'Correcao operacional confirmada',
    before: {
      participantId: 'participant-1',
      storedPoints: 10,
      storedXp: 10,
      ledgerPoints: 8,
      ledgerXp: 6,
      pointsDifference: 2,
      xpDifference: 4,
    },
    after: {
      participantId: 'participant-1',
      storedPoints: 10,
      storedXp: 10,
      ledgerPoints: 10,
      ledgerXp: 10,
      pointsDifference: 0,
      xpDifference: 0,
      pointEventId: 'point-1',
    },
    requestId: 'request-1',
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
  };
}

function pointEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'point-1',
    userId: 'participant-1',
    points: 2,
    xpDelta: 4,
    kind: PointEventKind.CREDIT,
    source: PointEventSource.ADMIN_ADJUST,
    actorAdminId: 'admin-1',
    idempotencyKey: confirmation().idempotencyKey,
    description: 'Correcao operacional confirmada',
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    auditEvent: auditEvent(),
    ...overrides,
  };
}

function reconciliationTransaction(
  overrides: {
    ledgerPoints?: number;
    ledgerXp?: number;
    existing?: ReturnType<typeof pointEvent> | null;
  } = {},
) {
  return {
    auditWriter: {},
    lockReconciliation: jest.fn().mockResolvedValue(
      row({
        ledgerPoints: overrides.ledgerPoints ?? 8,
        ledgerXp: overrides.ledgerXp ?? 6,
      }),
    ),
    findByIdempotencyKey: jest
      .fn()
      .mockResolvedValue(overrides.existing ?? null),
    createPointEvent: jest.fn(),
  };
}
