import {
  AuditActorType,
  AuditEntityType,
  AuditOperation,
} from '@prisma/client';
import { AuditRepository } from './audit.repository';

describe(AuditRepository.name, () => {
  it('applies combined filters, database pagination and stable ordering', async () => {
    const prisma = {
      adminAuditEvent: {
        count: jest.fn().mockResolvedValue(3),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const repository = new AuditRepository(prisma as never);
    const from = new Date('2026-07-01T00:00:00.000Z');
    const to = new Date('2026-07-14T23:59:59.999Z');

    await repository.findPage({
      page: 2,
      limit: 20,
      actorType: AuditActorType.ADMIN,
      actorAdminId: 'admin-1',
      operation: AuditOperation.ACTION_UPDATED,
      entityType: AuditEntityType.ACTION,
      entityId: 'action-1',
      participantId: 'participant-1',
      requestId: 'request-1',
      from,
      to,
    });

    const where = {
      actorType: AuditActorType.ADMIN,
      actorAdminId: 'admin-1',
      operation: AuditOperation.ACTION_UPDATED,
      entityType: AuditEntityType.ACTION,
      entityId: 'action-1',
      participantId: 'participant-1',
      requestId: 'request-1',
      createdAt: { gte: from, lte: to },
    };
    expect(prisma.adminAuditEvent.count).toHaveBeenCalledWith({ where });
    expect(prisma.adminAuditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        skip: 20,
        take: 20,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('binds writes to the exact transaction client without opening a transaction', async () => {
    const rootCreate = jest.fn();
    const transactionCreate = jest.fn().mockResolvedValue({ id: 'audit-1' });
    const transaction = {
      adminAuditEvent: { create: transactionCreate },
    };
    const prisma = {
      adminAuditEvent: { create: rootCreate },
      $transaction: jest.fn(),
    };
    const repository = new AuditRepository(prisma as never);

    await repository.bindTransaction(transaction as never).create({
      actorType: AuditActorType.SYSTEM,
      actorAdminId: null,
      participantId: null,
      operation: AuditOperation.RECONCILIATION_ADJUSTMENT_CONFIRMED,
      entityType: AuditEntityType.RECONCILIATION,
      entityId: 'reconciliation-1',
      reason: 'Correção automática reconciliada',
      requestId: 'request-1',
    });

    expect(transactionCreate).toHaveBeenCalledTimes(1);
    expect(rootCreate).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rolls back a provisional domain mutation and audit write after a failure', async () => {
    const committed = { domain: [] as string[], audit: [] as string[] };
    const prisma = {
      adminAuditEvent: { count: jest.fn(), findMany: jest.fn() },
      $transaction: jest.fn(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          const provisional = {
            domain: [...committed.domain],
            audit: [] as string[],
          };
          const tx = {
            domain: {
              create: (id: string) => provisional.domain.push(id),
            },
            adminAuditEvent: {
              create: ({ data }: { data: { entityId: string } }) => {
                provisional.audit.push(data.entityId);
                return Promise.resolve(data);
              },
            },
          };
          const result = await callback(tx);
          committed.domain = provisional.domain;
          committed.audit = provisional.audit;
          return result;
        },
      ),
    };
    const repository = new AuditRepository(prisma as never);

    await expect(
      prisma.$transaction(async (tx) => {
        (tx as { domain: { create(id: string): void } }).domain.create(
          'domain-1',
        );
        await repository.bindTransaction(tx as never).create({
          actorType: AuditActorType.SYSTEM,
          actorAdminId: null,
          participantId: null,
          operation: AuditOperation.RECONCILIATION_ADJUSTMENT_CONFIRMED,
          entityType: AuditEntityType.RECONCILIATION,
          entityId: 'reconciliation-1',
          reason: 'Correção automática reconciliada',
          requestId: 'request-1',
        });
        throw new Error('fail after provisional writes');
      }),
    ).rejects.toThrow('fail after provisional writes');
    expect(committed).toEqual({ domain: [], audit: [] });
  });
});
