import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ActionRedemptionMethod,
  PointEventKind,
  PointEventSource,
  UserRole,
} from '@prisma/client';
import {
  AdminParticipantsRepository,
  buildPointEventWhere,
  type PointEventFilter,
} from '../admin-participants.repository';
import { AdminParticipantsService } from '../admin-participants.service';
import { AdminPointEventsQueryDto } from '../dto/admin-point-events-query.dto';

describe('global point-event ledger', () => {
  it('builds one participant/date/method where for list and export callers', () => {
    const filter: PointEventFilter = {
      page: 2,
      limit: 10,
      search: ' Ada ',
      source: PointEventSource.ACTION_REDEEM,
      kind: PointEventKind.CREDIT,
      method: ActionRedemptionMethod.CLAIM_CODE,
      from: new Date('2026-08-01T03:00:00.000Z'),
      to: new Date('2026-08-03T03:00:00.000Z'),
    };

    expect(buildPointEventWhere(filter)).toEqual({
      user: {
        role: UserRole.PARTICIPANT,
        OR: [
          { name: { contains: 'Ada', mode: 'insensitive' } },
          { email: { contains: 'Ada', mode: 'insensitive' } },
        ],
      },
      source: PointEventSource.ACTION_REDEEM,
      kind: PointEventKind.CREDIT,
      redemptionMethod: ActionRedemptionMethod.CLAIM_CODE,
      createdAt: {
        gte: filter.from,
        lt: filter.to,
      },
    });
  });

  it('uses the same where builder for paginated point-event rows', async () => {
    const prisma = {
      pointEvent: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const repository = new AdminParticipantsRepository(prisma as never);
    const filter: PointEventFilter = {
      page: 2,
      limit: 10,
      search: 'Ada',
      source: PointEventSource.ADMIN_ADJUST,
      kind: PointEventKind.DEBIT,
    };

    await repository.findPointEventPage(filter);

    const where = buildPointEventWhere(filter);
    expect(prisma.pointEvent.count).toHaveBeenCalledWith({ where });
    expect(prisma.pointEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        skip: 10,
        take: 10,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('maps a global event without leaking raw claim codes and keeps legacy origin explicit', async () => {
    const repository = {
      findPointEventPage: jest.fn().mockResolvedValue({
        total: 1,
        rows: [
          {
            id: 'event-1',
            points: 25,
            xpDelta: 25,
            kind: PointEventKind.CREDIT,
            source: PointEventSource.ACTION_REDEEM,
            redemptionMethod: ActionRedemptionMethod.CLAIM_CODE,
            description: 'Resgate do credenciamento',
            createdAt: new Date('2026-08-02T12:00:00.000Z'),
            user: {
              id: 'participant-1',
              name: 'Ada',
              email: 'ada@example.test',
            },
            action: { id: 'action-1', name: 'Credenciamento', code: null },
            claimCode: { id: 'claim-1', code: 'ABCD-EFGH' },
            rewardRedemption: null,
            auditEvent: null,
            auditEventId: null,
            actorAdmin: null,
            reversedEventId: null,
            reversal: null,
          },
        ],
      }),
    };
    const service = new AdminParticipantsService(
      repository as never,
      { record: jest.fn() } as never,
    );

    const result = await service.findGlobalPointEvents({
      page: 1,
      limit: 20,
      source: 'action_redeem',
      kind: 'credit',
      method: 'claim_code',
    });

    expect(result.items[0]).toMatchObject({
      id: 'event-1',
      participant: {
        id: 'participant-1',
        name: 'Ada',
        email: 'ada@example.test',
      },
      action: { id: 'action-1', name: 'Credenciamento' },
      claimCode: { id: 'claim-1', code: 'AB*****GH' },
      origin: 'UNIQUE_CODE',
      reference: { type: 'ACTION', label: 'Credenciamento' },
      createdAt: '2026-08-02T12:00:00.000Z',
    });
    expect(JSON.stringify(result)).not.toContain('ABCD-EFGH');
    expect(repository.findPointEventPage).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      search: undefined,
      source: PointEventSource.ACTION_REDEEM,
      kind: PointEventKind.CREDIT,
      method: ActionRedemptionMethod.CLAIM_CODE,
      from: undefined,
      to: undefined,
    });
  });

  it('keeps reconciliation compensation explicit in the global ledger', async () => {
    const repository = {
      findPointEventPage: jest.fn().mockResolvedValue({
        total: 1,
        rows: [
          {
            id: 'event-reconciliation',
            points: 4,
            xpDelta: 4,
            kind: PointEventKind.CREDIT,
            source: PointEventSource.ADMIN_ADJUST,
            redemptionMethod: null,
            description: 'Compensação de reconciliação',
            createdAt: new Date('2026-08-02T12:00:00.000Z'),
            user: {
              id: 'participant-1',
              name: 'Ada',
              email: 'ada@example.test',
            },
            action: null,
            claimCode: null,
            rewardRedemption: null,
            auditEventId: 'audit-1',
            auditEvent: { operation: 'RECONCILIATION_ADJUSTMENT_CONFIRMED' },
            actorAdmin: { id: 'admin-1', name: 'Admin' },
            reversedEventId: null,
            reversal: null,
          },
        ],
      }),
    };
    const service = new AdminParticipantsService(
      repository as never,
      { record: jest.fn() } as never,
    );

    const result = await service.findGlobalPointEvents({
      page: 1,
      limit: 20,
    });

    expect(result.items[0]).toMatchObject({
      id: 'event-reconciliation',
      origin: 'RECONCILIATION_COMPENSATION',
      actor: { id: 'admin-1', name: 'Admin' },
      isAudited: true,
    });
  });
});

describe('AdminPointEventsQueryDto', () => {
  it('normalizes filters and requires a complete valid operational date range', async () => {
    const dto = plainToInstance(AdminPointEventsQueryDto, {
      search: ' Ada ',
      source: 'ACTION_REDEEM',
      kind: 'CREDIT',
      method: 'CLAIM_CODE',
      from: '2026-08-01',
      to: '2026-08-03',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.search).toBe('Ada');
    expect(dto.source).toBe('action_redeem');
    expect(dto.kind).toBe('credit');
    expect(dto.method).toBe('claim_code');

    const incomplete = plainToInstance(AdminPointEventsQueryDto, {
      from: '2026-08-01',
    });
    expect(await validate(incomplete)).toHaveLength(0);
  });
});
