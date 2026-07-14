import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ClaimCodesRepository } from '../claim-codes.repository';
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

describe(ClaimCodesService.name, () => {
  let service: ClaimCodesService;
  let repository: jest.Mocked<ClaimCodesRepository>;
  let audit: { record: jest.Mock };

  const context = { actorAdminId: 'admin-1', requestId: 'request-1' };

  beforeEach(async () => {
    const repositoryMock = {
      findActionForCodeBatch: jest.fn(),
      updateClaimCodeStatus: jest.fn(),
      findClaimCodeById: jest.fn(),
      insertClaimCodes: jest.fn(),
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
    expect(audit.record).toHaveBeenCalledTimes(1);
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
      type: 'CHECKIN',
    } as never);
    repository.insertClaimCodes.mockResolvedValue(
      Array.from({ length: quantity }, (_, index) => ({
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
    repository.findClaimCodeById.mockImplementation(async () => {
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
    });
    repository.updateClaimCodeStatus.mockImplementation((...args) => {
      const [, nextIsActive, previousIsActive] = args;
      if (isActive !== previousIsActive) return { count: 0 };
      isActive = nextIsActive;
      return { count: 1 };
    });

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
