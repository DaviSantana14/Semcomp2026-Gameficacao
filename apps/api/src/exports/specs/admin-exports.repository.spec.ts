/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { RedemptionStatus, UserRole } from '@prisma/client';
import {
  buildParticipantWhere,
  type ParticipantFilter,
} from '../../admin/admin-participants.repository';
import {
  buildPointEventWhere,
  type PointEventFilter,
} from '../../admin/admin-participants.repository';
import {
  buildCodeRedemptionWhere,
  type CodeRedemptionFilter,
} from '../../claim-codes/claim-codes.repository';
import {
  buildRedemptionWhere,
  type RedemptionFilter,
} from '../../rewards/rewards.repository';
import { AdminExportsRepository } from '../admin-exports.repository';

describe(AdminExportsRepository.name, () => {
  function createRepository() {
    const prisma = {
      user: { count: jest.fn(), findMany: jest.fn() },
      rewardRedemption: { count: jest.fn(), findMany: jest.fn() },
      pointEvent: { count: jest.fn(), findMany: jest.fn() },
    };
    return { repository: new AdminExportsRepository(prisma as never), prisma };
  }

  it('uses the participant where builder for both count and deterministic blocks', async () => {
    const { repository, prisma } = createRepository();
    const filter: ParticipantFilter = { search: ' Ana ', isActive: true };
    prisma.user.count.mockResolvedValue(1);
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'participant-1',
        name: 'Ana',
        cpf: '111',
        email: 'ana@example.test',
        points: 12,
        xp: 8,
        level: 2,
        isActive: true,
        createdAt: new Date('2026-08-22T12:00:00.000Z'),
      },
    ]);

    await expect(repository.countParticipants(filter)).resolves.toBe(1);
    await expect(
      repository.findParticipantExportBlock(filter, undefined),
    ).resolves.toHaveLength(1);

    const where = buildParticipantWhere(filter);
    expect(prisma.user.count).toHaveBeenCalledWith({ where });
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where,
      take: 1000,
      orderBy: { id: 'asc' },
      select: expect.objectContaining({
        name: true,
        email: true,
        cpf: true,
      }),
    });
    expect(where).toEqual({
      role: UserRole.PARTICIPANT,
      isActive: true,
      OR: [
        { name: { contains: 'Ana', mode: 'insensitive' } },
        { email: { contains: 'Ana', mode: 'insensitive' } },
        { cpf: { contains: 'Ana' } },
      ],
    });
  });

  it('continues a participant export block after the last id', async () => {
    const { repository, prisma } = createRepository();
    prisma.user.findMany.mockResolvedValue([]);
    const filter: ParticipantFilter = {};

    await repository.findParticipantExportBlock(filter, 'participant-1');

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: UserRole.PARTICIPANT, id: { gt: 'participant-1' } },
        take: 1000,
        orderBy: { id: 'asc' },
      }),
    );
  });

  it('uses the redemption where builder and fetches only approved export fields', async () => {
    const { repository, prisma } = createRepository();
    const filter: RedemptionFilter = {
      search: ' Ada ',
      rewardId: 'reward-1',
      status: RedemptionStatus.PENDING,
      from: new Date('2026-08-01T03:00:00.000Z'),
      to: new Date('2026-08-03T03:00:00.000Z'),
    };
    prisma.rewardRedemption.count.mockResolvedValue(2);
    prisma.rewardRedemption.findMany.mockResolvedValue([]);

    await expect(repository.countRedemptions(filter)).resolves.toBe(2);
    await repository.findRedemptionExportBlock(filter, undefined);

    const where = buildRedemptionWhere(filter);
    expect(prisma.rewardRedemption.count).toHaveBeenCalledWith({ where });
    expect(prisma.rewardRedemption.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        take: 1000,
        orderBy: { id: 'asc' },
        select: expect.objectContaining({
          pointsSpent: true,
          status: true,
          createdAt: true,
          deliveredAt: true,
          cancelledAt: true,
          user: expect.any(Object),
          reward: expect.any(Object),
        }),
      }),
    );
    expect(where).toEqual({
      status: RedemptionStatus.PENDING,
      rewardId: 'reward-1',
      createdAt: {
        gte: filter.from,
        lt: filter.to,
      },
      user: {
        OR: [
          { name: { contains: 'Ada', mode: 'insensitive' } },
          { email: { contains: 'Ada', mode: 'insensitive' } },
        ],
      },
    });
  });

  it('does not expose unrelated user credentials in the export select', async () => {
    const { repository, prisma } = createRepository();
    prisma.user.findMany.mockResolvedValue([]);

    await repository.findParticipantExportBlock({}, undefined);

    const call = prisma.user.findMany.mock.calls[0]?.[0] as {
      select: Record<string, unknown>;
    };
    expect(call.select).not.toHaveProperty('passwordHash');
    expect(call.select).not.toHaveProperty('sessions');
    expect(call.select).not.toHaveProperty('cpf', undefined);
  });

  it('uses the shared point-event and code-redemption builders for count and blocks', async () => {
    const { repository, prisma } = createRepository();
    const pointFilter: PointEventFilter = {
      page: 1,
      limit: 20,
      search: 'Ada',
      method: 'CLAIM_CODE',
      from: new Date('2026-08-01T03:00:00.000Z'),
      to: new Date('2026-08-03T03:00:00.000Z'),
    };
    const codeFilter: CodeRedemptionFilter = {
      page: 1,
      limit: 20,
      actionId: 'action-1',
      method: 'REUSABLE_CODE',
    };
    prisma.pointEvent.count.mockResolvedValue(2);
    prisma.pointEvent.findMany.mockResolvedValue([]);

    await expect(repository.countPointEvents(pointFilter)).resolves.toBe(2);
    await repository.findPointEventExportBlock(pointFilter, undefined);
    await expect(repository.countCodeRedemptions(codeFilter)).resolves.toBe(2);
    await repository.findCodeRedemptionExportBlock(codeFilter, undefined);

    expect(prisma.pointEvent.count).toHaveBeenNthCalledWith(1, {
      where: buildPointEventWhere(pointFilter),
    });
    expect(prisma.pointEvent.count).toHaveBeenNthCalledWith(2, {
      where: buildCodeRedemptionWhere(codeFilter),
    });
    expect(prisma.pointEvent.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: buildPointEventWhere(pointFilter),
        take: 1000,
        orderBy: { id: 'asc' },
      }),
    );
    expect(prisma.pointEvent.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: buildCodeRedemptionWhere(codeFilter),
        take: 1000,
        orderBy: { id: 'asc' },
      }),
    );
  });
});
