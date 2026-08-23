import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ClaimCodeBatchCreateInput,
  ClaimCodesRepository,
} from '../claim-codes.repository';
import { ClaimCodesService } from '../claim-codes.service';
import {
  AuditService,
  CLAIM_CODE_REDEMPTION_METHOD,
} from '../../audit/audit.service';
import {
  AuditActorType,
  AuditEntityType,
  AuditOperation,
} from '../../audit/audit.repository';
import { BulkClaimCodeStatusDto } from '../dto/bulk-claim-code-status.dto';
import { ClaimCodeBulkQueryDto } from '../dto/claim-code-bulk-query.dto';

describe(ClaimCodesService.name, () => {
  let service: ClaimCodesService;
  let repository: jest.Mocked<ClaimCodesRepository>;
  let audit: { record: jest.Mock };

  const context = { actorAdminId: 'admin-1', requestId: 'request-1' };

  beforeEach(async () => {
    const repositoryMock = {
      findActionForCodeBatch: jest.fn(),
      createBatch: jest
        .fn()
        .mockImplementation((input: ClaimCodeBatchCreateInput) => ({
          ...input,
          action: { id: 'action-1', name: 'Credenciamento', isActive: true },
          createdByAdmin: {
            id: 'admin-1',
            name: 'Admin',
            email: 'admin@example.test',
          },
          createdAt: new Date('2026-08-22T12:00:00.000Z'),
        })),
      findBatches: jest.fn(),
      findBatch: jest.fn(),
      getBatchCodes: jest.fn(),
      updateClaimCodeStatus: jest.fn(),
      findClaimCodeById: jest.fn(),
      insertClaimCodes: jest.fn(),
      lockClaimCodes: jest.fn(),
      updateClaimCodeStatuses: jest.fn(),
      createBulkOperation: jest.fn(),
      findBulkOperations: jest.fn(),
      findBulkOperation: jest.fn(),
      findBulkReport: jest.fn(),
      auditWriter: { create: jest.fn() },
      withTransaction: jest.fn(
        (callback: (transactional: ClaimCodesRepository) => unknown) =>
          callback(repositoryMock as never),
      ),
    };
    audit = { record: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        ClaimCodesService,
        // Recursive callback typing makes this local Nest test double dynamic.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        { provide: ClaimCodesRepository, useValue: repositoryMock },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get<ClaimCodesService>(ClaimCodesService);
    repository =
      module.get<jest.Mocked<ClaimCodesRepository>>(ClaimCodesRepository);
  });

  it('rejects generation when the action does not exist', async () => {
    repository.findActionForCodeBatch.mockResolvedValue(null);
    await expect(
      service.generateBatch(
        'missing',
        { quantity: 2, reason: 'Geracao administrativa do lote' },
        context,
      ),
    ).rejects.toEqual(
      new NotFoundException('Atividade pontuável não encontrada.'),
    );
  });

  it('classifies a mixed bulk status request, persists one report and writes one safe audit', async () => {
    const bulkRepository = repository as unknown as {
      lockClaimCodes: jest.Mock;
      updateClaimCodeStatuses: jest.Mock;
      createBulkOperation: jest.Mock;
    };
    bulkRepository.lockClaimCodes.mockResolvedValue([
      {
        id: 'code-1',
        code: 'ABCD-EFGH',
        isActive: true,
        isUsed: false,
      },
      {
        id: 'code-2',
        code: 'IJKL-MNOP',
        isActive: false,
        isUsed: false,
      },
      {
        id: 'code-3',
        code: 'QRST-UVWX',
        isActive: true,
        isUsed: true,
      },
    ]);
    bulkRepository.updateClaimCodeStatuses.mockResolvedValue({ count: 1 });
    bulkRepository.createBulkOperation.mockResolvedValue({
      id: 'bulk-1',
      actorAdminId: 'admin-1',
      targetIsActive: false,
      reason: 'Desativacao preventiva dos codigos selecionados',
      requestId: 'request-1',
      selectedCount: 4,
      changedCount: 1,
      unchangedCount: 1,
      usedCount: 1,
      notFoundCount: 1,
      createdAt: new Date('2026-08-22T12:00:00.000Z'),
      actorAdmin: {
        id: 'admin-1',
        name: 'Admin',
        email: 'admin@example.test',
      },
      items: [
        {
          requestedClaimCodeId: 'code-1',
          claimCodeId: 'code-1',
          maskedCode: 'AB*****GH',
          outcome: 'CHANGED',
        },
        {
          requestedClaimCodeId: 'code-2',
          claimCodeId: 'code-2',
          maskedCode: 'IJ*****OP',
          outcome: 'ALREADY_IN_STATE',
        },
        {
          requestedClaimCodeId: 'code-3',
          claimCodeId: 'code-3',
          maskedCode: 'QR*****WX',
          outcome: 'ALREADY_USED',
        },
        {
          requestedClaimCodeId: 'code-4',
          claimCodeId: null,
          maskedCode: null,
          outcome: 'NOT_FOUND',
        },
      ],
    });

    const dto: BulkClaimCodeStatusDto = {
      ids: ['code-3', 'code-1', 'code-4', 'code-2'],
      isActive: false,
      reason: 'Desativacao preventiva dos codigos selecionados',
      confirmation: 'DESATIVAR',
    };

    const result = await service.bulkUpdateStatus(dto, context);

    expect(result.counts).toEqual({
      selected: 4,
      changed: 1,
      unchanged: 1,
      used: 1,
      notFound: 1,
    });
    expect(
      result.items.map(({ requestedClaimCodeId }) => requestedClaimCodeId),
    ).toEqual(['code-1', 'code-2', 'code-3', 'code-4']);
    expect(bulkRepository.updateClaimCodeStatuses).toHaveBeenCalledWith(
      ['code-1'],
      false,
    );
    expect(bulkRepository.createBulkOperation).toHaveBeenCalledTimes(1);
    expect(
      JSON.stringify(bulkRepository.createBulkOperation.mock.calls),
    ).not.toContain('ABCD-EFGH');
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('ABCD-EFGH');
  });

  it('maps bulk history and detail dates while keeping report rows masked', async () => {
    const bulkRepository = repository as unknown as {
      findBulkOperations: jest.Mock;
      findBulkOperation: jest.Mock;
      findBulkReport: jest.Mock;
    };
    const row = {
      id: 'bulk-1',
      actorAdmin: {
        id: 'admin-1',
        name: 'Admin',
        email: 'admin@example.test',
      },
      targetIsActive: false,
      reason: 'Desativacao preventiva dos codigos',
      requestId: 'request-1',
      selectedCount: 1,
      changedCount: 1,
      unchangedCount: 0,
      usedCount: 0,
      notFoundCount: 0,
      createdAt: new Date('2026-08-22T12:00:00.000Z'),
      items: [
        {
          requestedClaimCodeId: 'code-1',
          claimCodeId: 'code-1',
          maskedCode: 'AB*****GH',
          outcome: 'CHANGED',
        },
      ],
    };
    bulkRepository.findBulkOperations.mockResolvedValue({
      rows: [row],
      total: 1,
    });
    bulkRepository.findBulkOperation.mockResolvedValue(row);
    bulkRepository.findBulkReport.mockResolvedValue({
      id: 'bulk-1',
      items: row.items,
    });

    const query: ClaimCodeBulkQueryDto = {
      page: 1,
      limit: 20,
      actorAdminId: 'admin-1',
      targetIsActive: false,
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-31T23:59:59.999Z',
    };
    await expect(service.findBulkOperations(query)).resolves.toMatchObject({
      meta: { total: 1 },
      items: [
        {
          id: 'bulk-1',
          createdAt: '2026-08-22T12:00:00.000Z',
          counts: { selected: 1, changed: 1 },
        },
      ],
    });
    expect(bulkRepository.findBulkOperations).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      actorAdminId: 'admin-1',
      targetIsActive: false,
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-31T23:59:59.999Z'),
    });
    await expect(service.findBulkOperation('bulk-1')).resolves.toMatchObject({
      id: 'bulk-1',
      createdAt: '2026-08-22T12:00:00.000Z',
    });
    await expect(service.getBulkReport('bulk-1')).resolves.toEqual(row.items);

    bulkRepository.findBulkOperation.mockResolvedValue(null);
    bulkRepository.findBulkReport.mockResolvedValue(null);
    await expect(service.findBulkOperation('missing')).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.getBulkReport('missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('maps filtered batch pages and converts operational records to public summaries', async () => {
    repository.findBatches.mockResolvedValue({
      rows: [
        {
          id: 'batch-1',
          actionId: 'action-1',
          createdByAdminId: 'admin-1',
          requestedQuantity: 2,
          createdQuantity: 2,
          reason: 'Geracao administrativa do lote',
          requestId: 'request-1',
          createdAt: new Date('2026-08-22T12:00:00.000Z'),
          action: { id: 'action-1', name: 'Credenciamento', isActive: true },
          createdByAdmin: {
            id: 'admin-1',
            name: 'Admin',
            email: 'admin@example.test',
          },
          counts: { available: 2, disabled: 0, used: 0, blocked: 0 },
        },
      ],
      total: 1,
    });

    const result = await service.findBatches({
      page: 2,
      limit: 10,
      actionId: 'action-1',
      actorAdminId: 'admin-1',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-31T23:59:59.999Z',
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(repository.findBatches).toHaveBeenCalledWith({
      page: 2,
      limit: 10,
      actionId: 'action-1',
      actorAdminId: 'admin-1',
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-31T23:59:59.999Z'),
    });
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: 'batch-1',
          createdAt: '2026-08-22T12:00:00.000Z',
          action: { id: 'action-1', name: 'Credenciamento' },
          createdBy: {
            id: 'admin-1',
            name: 'Admin',
            email: 'admin@example.test',
          },
        }),
      ],
      meta: { page: 2, limit: 10, total: 1, totalPages: 1 },
    });
  });

  it('returns batch details and rejects missing batches and legacy ids', async () => {
    repository.findBatch.mockResolvedValueOnce({
      id: 'batch-1',
      actionId: 'action-1',
      createdByAdminId: 'admin-1',
      requestedQuantity: 2,
      createdQuantity: 2,
      reason: 'Geracao administrativa do lote',
      requestId: 'request-1',
      createdAt: new Date('2026-08-22T12:00:00.000Z'),
      action: { id: 'action-1', name: 'Credenciamento', isActive: true },
      createdByAdmin: {
        id: 'admin-1',
        name: 'Admin',
        email: 'admin@example.test',
      },
      counts: { available: 2, disabled: 0, used: 0, blocked: 0 },
    });

    await expect(service.findBatch('batch-1')).resolves.toMatchObject({
      id: 'batch-1',
      createdAt: '2026-08-22T12:00:00.000Z',
      action: { id: 'action-1', name: 'Credenciamento' },
    });

    repository.findBatch.mockResolvedValue(null);
    await expect(service.findBatch('legacy-code-id')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns persisted codes for redownload and rejects an unknown batch', async () => {
    repository.getBatchCodes.mockResolvedValue(['BBBB-BBBB', 'AAAA-AAAA']);
    await expect(service.getBatchCodes('batch-1')).resolves.toEqual([
      'BBBB-BBBB',
      'AAAA-AAAA',
    ]);

    repository.getBatchCodes.mockResolvedValue(null);
    await expect(service.getBatchCodes('missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('maps a lost status update to the used-code conflict', async () => {
    repository.updateClaimCodeStatus.mockResolvedValue({ count: 0 });
    repository.findClaimCodeById
      .mockResolvedValueOnce({
        id: 'code-1',
        code: 'ABCD-EFGH',
        isActive: false,
        isUsed: false,
        createdAt: new Date(),
        usedAt: null,
        usedBy: null,
        action: { id: 'action-1', name: 'Check-in', isActive: true },
      })
      .mockResolvedValueOnce({
        id: 'code-1',
        code: 'ABCD-EFGH',
        isActive: false,
        isUsed: true,
        createdAt: new Date(),
        usedAt: new Date(),
        usedBy: null,
        action: { id: 'action-1', name: 'Check-in', isActive: true },
      });
    await expect(
      service.updateStatus(
        'code-1',
        { isActive: true, reason: 'Reativacao administrativa do codigo' },
        context,
      ),
    ).rejects.toEqual(
      new ConflictException('Código de uso único já utilizado.'),
    );
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('maps deletion after a lost status update to not found', async () => {
    repository.updateClaimCodeStatus.mockResolvedValue({ count: 0 });
    repository.findClaimCodeById
      .mockResolvedValueOnce({
        id: 'code-1',
        code: 'ABCD-EFGH',
        isActive: true,
        isUsed: false,
        createdAt: new Date(),
        usedAt: null,
        usedBy: null,
        action: { id: 'action-1', name: 'Check-in', isActive: true },
      })
      .mockResolvedValueOnce(null);

    await expect(
      service.updateStatus(
        'code-1',
        { isActive: false, reason: 'Desativacao administrativa do codigo' },
        context,
      ),
    ).rejects.toEqual(
      new NotFoundException('Código de uso único não encontrado.'),
    );
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('records one safe batch event in the code transaction', async () => {
    repository.findActionForCodeBatch.mockResolvedValue({
      id: 'action-1',
      name: 'Credenciamento',
      isActive: true,
      type: 'CHECKIN',
    } as never);
    repository.insertClaimCodes.mockResolvedValue([
      { id: 'code-id-1', code: 'ABCD-EFGH' },
      { id: 'code-id-2', code: 'IJKL-MNOP' },
    ] as never);

    const result = await service.generateBatch(
      'action-1',
      { quantity: 2, reason: 'Geracao administrativa do lote' },
      context,
    );

    expect(result.codes).toEqual(['ABCD-EFGH', 'IJKL-MNOP']);
    expect(result.batch).toMatchObject({
      action: { id: 'action-1', name: 'Credenciamento' },
      createdBy: {
        id: 'admin-1',
        name: 'Admin',
        email: 'admin@example.test',
      },
      requestedQuantity: 2,
      createdQuantity: 2,
      reason: 'Geracao administrativa do lote',
      requestId: 'request-1',
      counts: { available: 2, disabled: 0, used: 0, blocked: 0 },
    });
    const batchInput = repository.createBatch.mock.calls[0]?.[0] as
      | ClaimCodeBatchCreateInput
      | undefined;
    expect(batchInput).toBeDefined();
    if (!batchInput) throw new Error('Expected a persisted batch input.');
    expect(batchInput).toMatchObject({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      id: expect.any(String),
      actionId: 'action-1',
      createdByAdminId: 'admin-1',
      requestedQuantity: 2,
      createdQuantity: 2,
      reason: 'Geracao administrativa do lote',
      requestId: 'request-1',
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(repository.insertClaimCodes).toHaveBeenCalledWith(
      'action-1',
      batchInput.id,
      expect.any(Array),
    );
    expect(audit.record).toHaveBeenCalledTimes(1);
    const auditInput = (
      audit.record.mock.calls as unknown as Array<
        [unknown, { entityId: string }]
      >
    )[0]?.[1];
    expect(auditInput?.entityId).toBe(result.batch.id);
    expect(audit.record).toHaveBeenCalledWith(
      repository.auditWriter,
      expect.objectContaining({
        actor: { actorType: AuditActorType.ADMIN, ...context },
        operation: AuditOperation.CLAIM_CODE_BATCH_GENERATED,
        entityType: AuditEntityType.CLAIM_CODE_BATCH,
        // Jest asymmetric matcher is intentionally dynamic in this assertion.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        entityId: expect.any(String),
        reason: 'Geracao administrativa do lote',
        after: {
          requestedQuantity: 2,
          createdQuantity: 2,
          redemptionMethod: CLAIM_CODE_REDEMPTION_METHOD,
          actionId: 'action-1',
        },
      }),
    );
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('ABCD-EFGH');
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('IJKL-MNOP');
  });

  it('records one audit event for a large batch instead of one per code', async () => {
    const quantity = 100;
    repository.findActionForCodeBatch.mockResolvedValue({
      id: 'action-1',
      name: 'Credenciamento',
      isActive: true,
      type: 'CHECKIN',
    } as never);
    repository.insertClaimCodes.mockResolvedValue(
      Array.from({ length: quantity }, (_, index) => ({
        id: `code-${index}`,
        code: `CODE-${String(index).padStart(4, '0')}`,
      })),
    );

    const result = await service.generateBatch(
      'action-1',
      { quantity, reason: 'Geracao administrativa de lote grande' },
      context,
    );

    expect(result.quantity).toBe(quantity);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('audits a status change with only an internal id and safe mask', async () => {
    repository.findClaimCodeById
      .mockResolvedValueOnce({
        id: 'code-id-1',
        code: 'ABCD-EFGH',
        isActive: true,
        isUsed: false,
        usedBy: null,
        usedAt: null,
        createdAt: new Date(),
        action: { id: 'action-1', name: 'Credenciamento', isActive: true },
      })
      .mockResolvedValueOnce({
        id: 'code-id-1',
        code: 'ABCD-EFGH',
        isActive: false,
        isUsed: false,
        usedBy: null,
        usedAt: null,
        createdAt: new Date(),
        action: { id: 'action-1', name: 'Credenciamento', isActive: true },
      });
    repository.updateClaimCodeStatus.mockResolvedValue({ count: 1 });

    await service.updateStatus(
      'code-id-1',
      { isActive: false, reason: 'Desativacao administrativa do codigo' },
      context,
    );

    expect(repository.withTransaction.mock.calls).toHaveLength(1);
    expect(audit.record).toHaveBeenCalledWith(repository.auditWriter, {
      actor: { actorType: AuditActorType.ADMIN, ...context },
      operation: AuditOperation.CLAIM_CODE_STATUS_CHANGED,
      entityType: AuditEntityType.CLAIM_CODE,
      entityId: 'code-id-1',
      reason: 'Desativacao administrativa do codigo',
      before: {
        id: 'code-id-1',
        isActive: true,
        isUsed: false,
        maskedCode: 'AB*****GH',
      },
      after: {
        id: 'code-id-1',
        isActive: false,
        isUsed: false,
        maskedCode: 'AB*****GH',
      },
    });
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('ABCD-EFGH');
  });

  it('does not mutate or audit a status no-op', async () => {
    repository.findClaimCodeById.mockResolvedValue({
      id: 'code-id-1',
      code: 'ABCD-EFGH',
      isActive: false,
      isUsed: false,
      usedBy: null,
      usedAt: null,
      createdAt: new Date(),
      action: { id: 'action-1', name: 'Credenciamento', isActive: true },
    });

    await service.updateStatus(
      'code-id-1',
      { isActive: false, reason: 'Confirmacao administrativa do codigo' },
      context,
    );

    expect(repository.updateClaimCodeStatus.mock.calls).toHaveLength(0);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('allows only one concurrent status request to mutate and audit', async () => {
    let isActive = true;
    let initialReads = 0;
    let releaseInitialReads: () => void = () => undefined;
    const bothInitialReads = new Promise<void>((resolve) => {
      releaseInitialReads = resolve;
    });
    repository.findClaimCodeById.mockImplementation((async () => {
      initialReads += 1;
      const snapshot = {
        id: 'code-id-1',
        code: 'ABCD-EFGH',
        isActive,
        isUsed: false,
        usedBy: null,
        usedAt: null,
        createdAt: new Date(),
        action: { id: 'action-1', name: 'Credenciamento', isActive: true },
      };
      if (initialReads <= 2) {
        if (initialReads === 2) releaseInitialReads();
        await bothInitialReads;
      }
      return snapshot;
    }) as never);
    repository.updateClaimCodeStatus.mockImplementation(((
      ...args: [string, boolean, boolean]
    ) => {
      const [, nextIsActive, previousIsActive] = args;
      if (isActive !== previousIsActive) return { count: 0 };
      isActive = nextIsActive;
      return { count: 1 };
    }) as never);

    const results = await Promise.all([
      service.updateStatus(
        'code-id-1',
        { isActive: false, reason: 'Primeira desativacao concorrente' },
        context,
      ),
      service.updateStatus(
        'code-id-1',
        { isActive: false, reason: 'Segunda desativacao concorrente' },
        context,
      ),
    ]);

    expect(results).toEqual([
      expect.objectContaining({ status: 'DISABLED' }),
      expect.objectContaining({ status: 'DISABLED' }),
    ]);
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});
