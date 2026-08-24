import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ActionRedemptionMethod,
  PointEventSource,
  UserRole,
} from '@prisma/client';
import {
  buildCodeRedemptionWhere,
  ClaimCodesRepository,
  type CodeRedemptionFilter,
} from '../claim-codes.repository';
import { ClaimCodesService } from '../claim-codes.service';
import { CodeRedemptionsQueryDto } from '../dto/code-redemptions-query.dto';

describe('global code-redemption ledger', () => {
  it('forces action redemption and filters participant, action, method and [from,to)', () => {
    const filter: CodeRedemptionFilter = {
      page: 1,
      limit: 20,
      search: ' Ada ',
      actionId: 'action-1',
      method: ActionRedemptionMethod.CLAIM_CODE,
      from: new Date('2026-08-01T03:00:00.000Z'),
      to: new Date('2026-08-03T03:00:00.000Z'),
    };

    expect(buildCodeRedemptionWhere(filter)).toEqual({
      user: {
        role: UserRole.PARTICIPANT,
        OR: [
          { name: { contains: 'Ada', mode: 'insensitive' } },
          { email: { contains: 'Ada', mode: 'insensitive' } },
        ],
      },
      actionId: 'action-1',
      source: PointEventSource.ACTION_REDEEM,
      redemptionMethod: ActionRedemptionMethod.CLAIM_CODE,
      createdAt: {
        gte: filter.from,
        lt: filter.to,
      },
    });
  });

  it('limits the unfiltered ledger to reusable and unique code methods', () => {
    expect(buildCodeRedemptionWhere({ page: 1, limit: 20 })).toMatchObject({
      source: PointEventSource.ACTION_REDEEM,
      redemptionMethod: {
        in: [
          ActionRedemptionMethod.REUSABLE_CODE,
          ActionRedemptionMethod.CLAIM_CODE,
        ],
      },
    });
  });

  it('queries code redemptions through the point-event table', async () => {
    const prisma = {
      pointEvent: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const repository = new ClaimCodesRepository(prisma as never);
    const filter: CodeRedemptionFilter = {
      page: 2,
      limit: 10,
      method: ActionRedemptionMethod.REUSABLE_CODE,
    };

    await repository.findCodeRedemptionPage(filter);

    const where = buildCodeRedemptionWhere(filter);
    expect(prisma.pointEvent.count).toHaveBeenCalledWith({ where });
    expect(prisma.pointEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        skip: 10,
        take: 10,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        // Jest's nested asymmetric matcher is intentionally dynamic.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        select: expect.objectContaining({
          user: { select: { id: true, name: true } },
        }),
      }),
    );
  });

  it('maps reusable and claim codes to masked values only', async () => {
    const repository = {
      findCodeRedemptionPage: jest.fn().mockResolvedValue({
        total: 1,
        rows: [
          {
            id: 'event-1',
            points: 30,
            xpDelta: 30,
            kind: 'CREDIT',
            source: 'ACTION_REDEEM',
            redemptionMethod: ActionRedemptionMethod.REUSABLE_CODE,
            createdAt: new Date('2026-08-02T12:00:00.000Z'),
            user: {
              id: 'participant-1',
              name: 'Ada',
              email: 'ada@example.test',
              cpf: '123.456.789-00',
            },
            action: {
              id: 'action-1',
              name: 'Credenciamento',
              code: 'REUSABLE-RAW',
            },
            claimCode: null,
          },
        ],
      }),
    };
    const service = new ClaimCodesService(
      repository as never,
      { record: jest.fn() } as never,
    );

    const result = await service.findCodeRedemptions({
      page: 1,
      limit: 20,
      method: 'reusable_code',
    });

    expect(result.items[0]).toEqual({
      id: 'event-1',
      points: 30,
      xpDelta: 30,
      participant: {
        id: 'participant-1',
        name: 'Ada',
      },
      action: { id: 'action-1', name: 'Credenciamento' },
      method: ActionRedemptionMethod.REUSABLE_CODE,
      code: 'RE********AW',
      createdAt: '2026-08-02T12:00:00.000Z',
    });
    expect(JSON.stringify(result)).not.toContain('ada@example.test');
    expect(JSON.stringify(result)).not.toContain('123.456.789-00');
    expect(JSON.stringify(result)).not.toContain('REUSABLE-RAW');
  });
});

describe('CodeRedemptionsQueryDto', () => {
  it('accepts normalized filters and rejects invalid enum values', async () => {
    const valid = plainToInstance(CodeRedemptionsQueryDto, {
      search: ' Ada ',
      method: 'CLAIM_CODE',
      from: '2026-08-01',
      to: '2026-08-03',
    });
    expect(await validate(valid)).toHaveLength(0);
    expect(valid.search).toBe('Ada');
    expect(valid.method).toBe('claim_code');

    const designAlias = plainToInstance(CodeRedemptionsQueryDto, {
      method: 'reusable',
    });
    expect(await validate(designAlias)).toHaveLength(0);

    const invalid = plainToInstance(CodeRedemptionsQueryDto, {
      method: 'direct',
    });
    expect(await validate(invalid)).not.toHaveLength(0);
  });
});
