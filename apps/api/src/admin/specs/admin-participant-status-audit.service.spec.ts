import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditOperation } from '../../audit/audit.repository';
import { AuditService } from '../../audit/audit.service';
import { ParticipantPasswordService } from '../../auth/participant-password.service';
import { AdminParticipantsRepository } from '../admin-participants.repository';
import { AdminParticipantsService } from '../admin-participants.service';

describe('participant status audit', () => {
  it('locks the participant row before reading the audited status', async () => {
    let sql = '';
    const raw = jest.fn((query: { strings: readonly string[] }) => {
      sql = query.strings.join('?');
      return Promise.resolve([{ id: 'participant-1', isActive: true }]);
    });
    const repository = new AdminParticipantsRepository({
      $queryRaw: raw,
    } as never);

    await repository.lockParticipantStatus('participant-1');

    expect(sql).toMatch(/FROM "User"[\s\S]*FOR UPDATE/);
  });
  let service: AdminParticipantsService;
  let repository: {
    withTransaction: jest.Mock;
    findParticipantById: jest.Mock;
    findParticipantCounters: jest.Mock;
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    repository = {
      withTransaction: jest.fn(),
      findParticipantById: jest.fn(),
      findParticipantCounters: jest.fn().mockResolvedValue({
        actionRedemptions: 0,
        claimCodes: 0,
        movements: 0,
        rewards: [],
      }),
    };
    audit = { record: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
    const module = await Test.createTestingModule({
      providers: [
        AdminParticipantsService,
        { provide: AdminParticipantsRepository, useValue: repository },
        { provide: AuditService, useValue: audit },
        { provide: ParticipantPasswordService, useValue: { hash: jest.fn() } },
      ],
    }).compile();
    service = module.get(AdminParticipantsService);
  });

  it('updates participant status and audit in one transaction', async () => {
    const transaction = {
      auditWriter: { create: jest.fn() },
      lockParticipantStatus: jest
        .fn()
        .mockResolvedValue({ id: 'p1', isActive: true }),
      revokeOpenSessions: jest.fn().mockResolvedValue(2),
      updateParticipantStatus: jest
        .fn()
        .mockResolvedValue({ id: 'p1', isActive: false }),
    };
    repository.withTransaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
      (callback) => callback(transaction),
    );
    repository.findParticipantById.mockResolvedValue({
      id: 'p1',
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      _count: { pointEvents: 0, rewardRedemptions: 0 },
    });

    await service.updateStatus(
      'p1',
      { isActive: false, reason: 'Desativacao operacional confirmada' },
      { actorAdminId: 'admin-1', requestId: 'request-1' },
    );

    expect(transaction.updateParticipantStatus).toHaveBeenCalledWith(
      'p1',
      false,
    );
    expect(transaction.revokeOpenSessions).toHaveBeenCalledWith(
      'p1',
      expect.any(Date),
    );
    expect(audit.record).toHaveBeenCalledWith(
      transaction.auditWriter,
      expect.objectContaining({
        operation: AuditOperation.PARTICIPANT_STATUS_CHANGED,
        participantId: 'p1',
        before: { id: 'p1', isActive: true },
        after: { id: 'p1', isActive: false },
      }),
    );
  });

  it('returns no-op success without a domain write or audit event', async () => {
    const transaction = {
      auditWriter: { create: jest.fn() },
      lockParticipantStatus: jest
        .fn()
        .mockResolvedValue({ id: 'p1', isActive: true }),
      revokeOpenSessions: jest.fn(),
      updateParticipantStatus: jest.fn(),
    };
    repository.withTransaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
      (callback) => callback(transaction),
    );
    repository.findParticipantById.mockResolvedValue({
      id: 'p1',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      _count: { pointEvents: 0, rewardRedemptions: 0 },
    });

    await service.updateStatus(
      'p1',
      { isActive: true, reason: 'Confirmacao operacional registrada' },
      { actorAdminId: 'admin-1', requestId: 'request-1' },
    );
    expect(transaction.updateParticipantStatus).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('does not audit a missing or invalid participant target', async () => {
    const transaction = {
      auditWriter: { create: jest.fn() },
      lockParticipantStatus: jest.fn().mockResolvedValue(null),
      revokeOpenSessions: jest.fn(),
      updateParticipantStatus: jest.fn(),
    };
    repository.withTransaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
      (callback) => callback(transaction),
    );

    await expect(
      service.updateStatus(
        'admin-or-missing',
        { isActive: false, reason: 'Desativacao operacional confirmada' },
        { actorAdminId: 'admin-1', requestId: 'request-1' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.updateParticipantStatus).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('propagates an audit writer failure from the transaction callback', async () => {
    const failure = new Error('audit writer failed');
    const transaction = {
      auditWriter: { create: jest.fn() },
      lockParticipantStatus: jest
        .fn()
        .mockResolvedValue({ id: 'p1', isActive: true }),
      revokeOpenSessions: jest.fn(),
      updateParticipantStatus: jest
        .fn()
        .mockResolvedValue({ id: 'p1', isActive: false }),
    };
    audit.record.mockRejectedValue(failure);
    repository.withTransaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
      (callback) => callback(transaction),
    );

    await expect(
      service.updateStatus(
        'p1',
        { isActive: false, reason: 'Desativacao operacional confirmada' },
        { actorAdminId: 'admin-1', requestId: 'request-1' },
      ),
    ).rejects.toBe(failure);
    expect(repository.findParticipantById).not.toHaveBeenCalled();
  });

  it('rolls back the participant state when the audit writer fails', async () => {
    const failure = new Error('audit writer failed');
    const state = { participant: { id: 'p1', isActive: true }, audits: 0 };
    const transaction = {
      auditWriter: { create: jest.fn() },
      lockParticipantStatus: jest.fn(() =>
        Promise.resolve({ ...state.participant }),
      ),
      revokeOpenSessions: jest.fn(),
      updateParticipantStatus: jest.fn((id: string, isActive: boolean) => {
        state.participant = { id, isActive };
        return Promise.resolve({ ...state.participant });
      }),
    };
    audit.record.mockRejectedValue(failure);
    repository.withTransaction.mockImplementation(async (callback) => {
      const before = { ...state.participant };
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        await callback(transaction);
      } catch (error) {
        state.participant = before;
        throw error;
      }
    });

    await expect(
      service.updateStatus(
        'p1',
        { isActive: false, reason: 'Desativacao operacional confirmada' },
        { actorAdminId: 'admin-1', requestId: 'request-1' },
      ),
    ).rejects.toBe(failure);

    expect(state).toEqual({
      participant: { id: 'p1', isActive: true },
      audits: 0,
    });
  });
});
