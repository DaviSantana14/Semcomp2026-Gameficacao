import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  AuditEntityType,
  AuditOperation,
  PointEventKind,
  PointEventSource,
  UserRole,
} from '@prisma/client';
import { PersistenceUniqueConstraintError } from '../../common/persistence-errors';
import { AdminAdjustmentsRepository } from '../admin-adjustments.repository';
import { AdminAdjustmentsService } from '../admin-adjustments.service';

describe(AdminAdjustmentsService.name, () => {
  const participant = {
    id: 'participant-1',
    points: 100,
    xp: 50,
    level: 7,
    isActive: true,
    role: UserRole.PARTICIPANT,
  };
  const actor = { actorAdminId: 'admin-1', requestId: 'request-1' };
  const dto = {
    pointsDelta: 10,
    xpDelta: 5,
    reason: 'Correcao operacional confirmada',
    idempotencyKey: '1d61fd98-1470-4ed2-95b9-1ae6fe310b18',
  };
  const auditEvent = {
    id: 'audit-1',
    operation: AuditOperation.PARTICIPANT_BALANCE_ADJUSTED,
    requestId: actor.requestId,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    reason: dto.reason,
    before: { participantId: participant.id, points: 100, xp: 50 },
    after: {
      participantId: participant.id,
      points: 110,
      xp: 55,
      pointEventId: 'event-1',
    },
  };
  const pointEvent = {
    id: 'event-1',
    userId: participant.id,
    points: dto.pointsDelta,
    xpDelta: dto.xpDelta,
    kind: PointEventKind.CREDIT,
    source: PointEventSource.ADMIN_GRANT,
    actorAdminId: actor.actorAdminId,
    idempotencyKey: dto.idempotencyKey,
    description: dto.reason,
    createdAt: new Date('2026-07-14T12:00:00.000Z'),
    auditEvent,
  };
  const transaction = {
    auditWriter: { create: jest.fn() },
    lockParticipant: jest.fn(),
    findByIdempotencyKey: jest.fn(),
    createPointEvent: jest.fn(),
    updateParticipantBalance: jest.fn(),
  };
  const repository = {
    withTransaction: jest.fn(),
    findByIdempotencyKey: jest.fn(),
  };
  const audit = { record: jest.fn() };
  let service: AdminAdjustmentsService;

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.lockParticipant.mockResolvedValue(participant);
    transaction.findByIdempotencyKey.mockResolvedValue(null);
    transaction.createPointEvent.mockResolvedValue(pointEvent);
    transaction.updateParticipantBalance.mockResolvedValue({
      id: participant.id,
      points: 110,
      xp: 55,
      level: participant.level,
    });
    audit.record.mockResolvedValue(auditEvent);
    repository.withTransaction.mockImplementation(
      (callback: (value: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    );
    service = new AdminAdjustmentsService(
      repository as unknown as AdminAdjustmentsRepository,
      audit as never,
    );
  });

  it.each(['missing', 'admin'])(
    'hides %s target as a missing participant',
    async () => {
      transaction.lockParticipant.mockResolvedValue(null);

      await expect(service.adjust('target', dto, actor)).rejects.toEqual(
        new NotFoundException('Participante não encontrado.'),
      );
      expect(transaction.createPointEvent).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ pointsDelta: -101, xpDelta: 0 }, 'points'],
    [{ pointsDelta: 0, xpDelta: -51 }, 'XP'],
  ])('rejects a negative final %s balance without writes', async (change) => {
    await expect(
      service.adjust(participant.id, { ...dto, ...change }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.createPointEvent).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it.each([
    [10, 0, PointEventKind.CREDIT, PointEventSource.ADMIN_GRANT],
    [0, 5, PointEventKind.CREDIT, PointEventSource.ADMIN_GRANT],
    [10, 5, PointEventKind.CREDIT, PointEventSource.ADMIN_GRANT],
    [-10, -5, PointEventKind.DEBIT, PointEventSource.ADMIN_ADJUST],
  ])(
    'persists points=%i XP=%i with the expected kind and source',
    async (pointsDelta, xpDelta, kind, source) => {
      const result = await service.adjust(
        participant.id,
        { ...dto, pointsDelta, xpDelta },
        actor,
      );

      expect(transaction.createPointEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: participant.id,
          points: pointsDelta,
          xpDelta,
          kind,
          source,
          actorAdminId: actor.actorAdminId,
          idempotencyKey: dto.idempotencyKey,
          auditEventId: auditEvent.id,
        }),
      );
      expect(transaction.updateParticipantBalance).toHaveBeenCalledWith(
        participant.id,
        pointsDelta,
        xpDelta,
      );
      expect(result.replayed).toBe(false);
    },
  );

  it('records a minimized discriminated audit event and never changes level', async () => {
    const result = await service.adjust(participant.id, dto, actor);
    const stringMatcher: unknown = expect.any(String);

    expect(audit.record).toHaveBeenCalledWith(transaction.auditWriter, {
      actor: { actorType: AuditActorType.ADMIN, ...actor },
      operation: AuditOperation.PARTICIPANT_BALANCE_ADJUSTED,
      entityType: AuditEntityType.POINT_EVENT,
      entityId: stringMatcher,
      participantId: participant.id,
      reason: dto.reason,
      before: {
        participantId: participant.id,
        points: 100,
        xp: 50,
        role: UserRole.PARTICIPANT,
        isActive: true,
      },
      after: {
        participantId: participant.id,
        points: 110,
        xp: 55,
        role: UserRole.PARTICIPANT,
        isActive: true,
        pointEventId: stringMatcher,
      },
      metadata: { pointEventId: stringMatcher },
    });
    expect(transaction.updateParticipantBalance).toHaveBeenCalledWith(
      participant.id,
      10,
      5,
    );
    expect(result.after).toEqual({ points: 110, xp: 55 });
  });

  it('replays identical canonical content without writing', async () => {
    transaction.findByIdempotencyKey.mockResolvedValue(pointEvent);

    const result = await service.adjust(participant.id, dto, actor);

    expect(result.replayed).toBe(true);
    expect(result.pointEvent.id).toBe(pointEvent.id);
    expect(transaction.createPointEvent).not.toHaveBeenCalled();
    expect(transaction.updateParticipantBalance).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it.each([
    { pointsDelta: 11 },
    { xpDelta: 6 },
    { reason: 'Outro motivo operacional valido' },
  ])('rejects conflicting key reuse for changed content %#', async (change) => {
    transaction.findByIdempotencyKey.mockResolvedValue(pointEvent);

    await expect(
      service.adjust(participant.id, { ...dto, ...change }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects the same key when the target changes', async () => {
    transaction.lockParticipant.mockResolvedValue({
      ...participant,
      id: 'participant-2',
    });
    transaction.findByIdempotencyKey.mockResolvedValue(pointEvent);

    await expect(
      service.adjust('participant-2', dto, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('compares the actor when deciding whether a key is a replay', async () => {
    transaction.findByIdempotencyKey.mockResolvedValue(pointEvent);

    await expect(
      service.adjust(participant.id, dto, {
        ...actor,
        actorAdminId: 'admin-2',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('recovers a concurrent same-key winner as an identical replay', async () => {
    repository.withTransaction.mockRejectedValue(
      new PersistenceUniqueConstraintError(),
    );
    repository.findByIdempotencyKey.mockResolvedValue(pointEvent);

    await expect(service.adjust(participant.id, dto, actor)).resolves.toEqual(
      expect.objectContaining({ replayed: true }),
    );
  });

  it('returns conflict after a concurrent winner with different content', async () => {
    repository.withTransaction.mockRejectedValue(
      new PersistenceUniqueConstraintError(),
    );
    repository.findByIdempotencyKey.mockResolvedValue({
      ...pointEvent,
      xpDelta: 6,
    });

    await expect(
      service.adjust(participant.id, dto, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('propagates audit failure after the provisional balance write', async () => {
    const failure = new Error('audit failed');
    audit.record.mockRejectedValue(failure);

    await expect(service.adjust(participant.id, dto, actor)).rejects.toBe(
      failure,
    );
    expect(transaction.createPointEvent).not.toHaveBeenCalled();
    expect(transaction.updateParticipantBalance).toHaveBeenCalledWith(
      participant.id,
      dto.pointsDelta,
      dto.xpDelta,
    );
  });
});
