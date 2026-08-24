import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditOperation, UserRole } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { ParticipantPasswordService } from '../../auth/participant-password.service';
import { AdminParticipantsRepository } from '../admin-participants.repository';
import { AdminParticipantsService } from '../admin-participants.service';

describe('AdminParticipantsService.resetPassword', () => {
  const queryRaw = jest.fn();
  const passwordHash = jest.fn();
  const auditRecord = jest.fn();
  const now = new Date('2026-08-23T12:00:00.000Z');
  const prisma = {
    user: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    userSession: { updateMany: jest.fn() },
    $queryRaw: queryRaw,
    $transaction: jest.fn(),
  };

  let service: AdminParticipantsService;

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(now);
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (transaction: typeof prisma) => unknown) => callback(prisma),
    );
    passwordHash.mockResolvedValue('$2b$12$temporary-hash');
    prisma.userSession.updateMany.mockResolvedValue({ count: 2 });
    prisma.user.update.mockResolvedValue({
      id: 'participant-1',
      passwordResetRequired: true,
      passwordResetExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    });
    queryRaw.mockImplementation(
      async (): Promise<
        Array<{
          id: string;
          role: UserRole;
          isActive: boolean;
          passwordResetRequired: boolean;
          passwordResetExpiresAt: Date | null;
        }>
      > => {
        const row = (await prisma.user.findFirst()) as {
          id: string;
          role: UserRole;
          isActive: boolean;
          passwordResetRequired: boolean;
          passwordResetExpiresAt: Date | null;
        } | null;
        return row ? [row] : [];
      },
    );

    const module = await Test.createTestingModule({
      providers: [
        AdminParticipantsService,
        {
          provide: AdminParticipantsRepository,
          useValue: new AdminParticipantsRepository(prisma as never),
        },
        { provide: AuditService, useValue: { record: auditRecord } },
        {
          provide: ParticipantPasswordService,
          useValue: { hash: passwordHash },
        },
      ],
    }).compile();
    service = module.get(AdminParticipantsService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('hashes before the transaction, resets the participant, revokes sessions, and audits without the plaintext', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'participant-1',
      role: UserRole.PARTICIPANT,
      isActive: true,
      passwordResetRequired: false,
      passwordResetExpiresAt: null,
    });

    const result = await service.resetPassword(
      'participant-1',
      { reason: 'Participante solicitou suporte', replacePending: false },
      { actorAdminId: 'admin-1', requestId: 'request-1' },
    );

    expect(passwordHash.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.$transaction.mock.invocationCallOrder[0],
    );
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'participant-1' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          passwordHash: '$2b$12$temporary-hash',
          passwordResetRequired: true,
          passwordResetExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        }),
      }),
    );
    expect(prisma.userSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({ userId: 'participant-1' }),
      }),
    );
    expect(auditRecord).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        operation: AuditOperation.PARTICIPANT_PASSWORD_RESET,
        participantId: 'participant-1',
        metadata: { sessionsRevoked: 2 },
      }),
    );
    expect(JSON.stringify(auditRecord.mock.calls)).not.toContain(
      'temporary-hash',
    );
    expect(result.temporaryPassword).toHaveLength(20);
    expect(result.expiresAt).toBe(
      new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    );
  });

  it('rejects a missing participant without changing persistence', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.resetPassword(
        'missing',
        { reason: 'Participante solicitou suporte', replacePending: false },
        { actorAdminId: 'admin-1', requestId: 'request-1' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(passwordHash).toHaveBeenCalled();
  });

  it('requires explicit replacement for an unexpired pending reset', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'participant-1',
      role: UserRole.PARTICIPANT,
      isActive: true,
      passwordResetRequired: true,
      passwordResetExpiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    });

    await expect(
      service.resetPassword(
        'participant-1',
        { reason: 'Participante solicitou suporte', replacePending: false },
        { actorAdminId: 'admin-1', requestId: 'request-1' },
      ),
    ).rejects.toMatchObject({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      response: expect.objectContaining({
        statusCode: 409,
        code: 'PASSWORD_RESET_PENDING',
      }),
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.userSession.updateMany).not.toHaveBeenCalled();
    expect(auditRecord).not.toHaveBeenCalled();
  });

  it('allows an explicit replacement and keeps an inactive participant inactive', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'participant-1',
      role: UserRole.PARTICIPANT,
      isActive: false,
      passwordResetRequired: true,
      passwordResetExpiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    });

    await service.resetPassword(
      'participant-1',
      { reason: 'Participante solicitou suporte', replacePending: true },
      { actorAdminId: 'admin-1', requestId: 'request-1' },
    );

    const updateCall = (
      prisma.user.update.mock.calls as unknown[][]
    )[0]?.[0] as { data: { isActive?: boolean } };
    expect(updateCall.data.isActive).toBeUndefined();
  });
});
