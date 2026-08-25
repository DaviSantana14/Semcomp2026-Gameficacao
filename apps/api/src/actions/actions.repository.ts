import { Injectable, Optional } from '@nestjs/common';
import {
  ActionType,
  PointEventKind,
  PointEventSource,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PersistenceUniqueConstraintError } from '../common/persistence-errors';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuditRepository,
  TransactionAuditWriter,
} from '../audit/audit.repository';

const actionSummarySelect = {
  id: true,
  name: true,
  description: true,
  type: true,
  code: true,
  points: true,
  isActive: true,
  isCodeActive: true,
  createdAt: true,
} as const;

const userProgressSelect = {
  id: true,
  points: true,
  xp: true,
  level: true,
} as const;

export type QuestionGrantParticipant = {
  id: string;
  points: number;
  xp: number;
  level: number;
  role: UserRole;
  isActive: boolean;
};

type ActionsDatabase = Pick<
  Prisma.TransactionClient,
  '$queryRaw' | 'action' | 'claimCode' | 'pointEvent' | 'user'
>;

export type ActionSummary = Prisma.ActionGetPayload<{
  select: typeof actionSummarySelect;
}>;

export interface ActionWriteInput {
  name: string;
  description?: string | null;
  type: ActionType;
  code?: string | null;
  points: number;
  isActive?: boolean;
  isCodeActive: boolean;
}

export type ActionUpdateInput = Partial<ActionWriteInput>;

export interface ActionPageFilter {
  page: number;
  limit: number;
  search?: string;
  isActive?: boolean;
  type?: ActionType;
}

export interface ReusableCodePageFilter {
  page: number;
  limit: number;
  search?: string;
  actionId?: string;
  state?: 'active' | 'disabled' | 'blocked';
}

export interface QuestionGrantParticipantPageFilter {
  page: number;
  limit: number;
  search?: string;
}

@Injectable()
export class ActionsRepository {
  private client: ActionsDatabase;
  auditWriter?: TransactionAuditWriter;

  constructor(
    private prisma: PrismaService,
    @Optional() private auditRepository?: AuditRepository,
  ) {
    this.client = prisma;
  }

  withTransaction<T>(
    callback: (
      repository: ActionsRepository,
      transaction: Prisma.TransactionClient,
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction((tx) =>
      callback(this.transactional(tx), tx),
    );
  }

  async createAction(input: ActionWriteInput) {
    try {
      return await this.client.action.create({
        data: input,
        select: actionSummarySelect,
      });
    } catch (error) {
      this.rethrowUniqueConstraint(error);
    }
  }

  findActions() {
    return this.client.action.findMany({
      select: actionSummarySelect,
      orderBy: { createdAt: 'asc' },
    });
  }

  findActionById(id: string) {
    return this.client.action.findUnique({
      where: { id },
      select: actionSummarySelect,
    });
  }

  async lockActionById(id: string) {
    const rows = await this.client.$queryRaw<ActionSummary[]>(Prisma.sql`
      SELECT
        "id", "name", "description", "type", "code", "points",
        "isActive", "isCodeActive", "createdAt"
      FROM "Action"
      WHERE "id" = ${id}
      FOR UPDATE
    `);
    return rows[0] ?? null;
  }

  async lockParticipantForQuestionGrant(id: string) {
    const rows = await this.client.$queryRaw<QuestionGrantParticipant[]>(
      Prisma.sql`
        SELECT "id", "points", "xp", "level", "role", "isActive"
        FROM "User"
        WHERE "id" = ${id} AND "role" = 'PARTICIPANT'
        FOR UPDATE
      `,
    );
    return rows[0] ?? null;
  }

  findActionCodeState(id: string) {
    return this.client.action.findUnique({
      where: { id },
      select: { id: true, code: true, isCodeActive: true },
    });
  }

  findReusableCodeQr(id: string) {
    return this.client.action.findUnique({
      where: { id },
      select: { id: true, name: true, code: true },
    });
  }

  async updateAction(id: string, input: ActionUpdateInput) {
    try {
      return await this.client.action.update({
        where: { id },
        data: input,
        select: actionSummarySelect,
      });
    } catch (error) {
      this.rethrowUniqueConstraint(error);
    }
  }

  async findAdminActionPage(filter: ActionPageFilter) {
    const where: Prisma.ActionWhereInput = {};
    if (filter.isActive !== undefined) where.isActive = filter.isActive;
    if (filter.type) where.type = filter.type;
    if (filter.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { description: { contains: filter.search, mode: 'insensitive' } },
        { code: { contains: filter.search, mode: 'insensitive' } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.client.action.count({ where }),
      this.client.action.findMany({
        where,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        orderBy: { createdAt: 'desc' },
        select: actionSummarySelect,
      }),
    ]);
    return { rows, total };
  }

  async findQuestionGrantParticipantPage(
    filter: QuestionGrantParticipantPageFilter,
  ) {
    const where: Prisma.UserWhereInput = {
      role: UserRole.PARTICIPANT,
      ...(filter.search && {
        name: { contains: filter.search, mode: 'insensitive' },
      }),
    };
    const [total, rows] = await Promise.all([
      this.client.user.count({ where }),
      this.client.user.findMany({
        where,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true, points: true, isActive: true },
      }),
    ]);
    return { rows, total };
  }

  async findActionCounters(actionIds: string[]) {
    if (!actionIds.length) return { claimCounts: [], redemptionCounts: [] };
    const [claimCounts, redemptionCounts] = await Promise.all([
      this.client.claimCode.groupBy({
        by: ['actionId', 'isUsed', 'isActive'],
        where: { actionId: { in: actionIds } },
        _count: { _all: true },
      }),
      this.client.pointEvent.groupBy({
        by: ['actionId'],
        where: { actionId: { in: actionIds }, source: 'ACTION_REDEEM' },
        _count: { _all: true },
      }),
    ]);
    return { claimCounts, redemptionCounts };
  }

  async findReusableCodePage(filter: ReusableCodePageFilter) {
    const where: Prisma.ActionWhereInput = { code: { not: null } };
    if (filter.actionId) where.id = filter.actionId;
    if (filter.state === 'active') {
      Object.assign(where, { isActive: true, isCodeActive: true });
    }
    if (filter.state === 'disabled') where.isCodeActive = false;
    if (filter.state === 'blocked') {
      Object.assign(where, { isActive: false, isCodeActive: true });
    }
    if (filter.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { code: { contains: filter.search, mode: 'insensitive' } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.client.action.count({ where }),
      this.client.action.findMany({
        where,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        orderBy: { createdAt: 'desc' },
        select: actionSummarySelect,
      }),
    ]);
    return { rows, total };
  }

  async findReusableCodeUses(actionIds: string[]): Promise<
    Array<{
      actionId: string | null;
      _count: { _all: number };
      _max: { createdAt: Date | null };
    }>
  > {
    if (!actionIds.length) return Promise.resolve([]);
    const uses: unknown = await this.client.pointEvent.groupBy({
      by: ['actionId'],
      where: {
        actionId: { in: actionIds },
        source: 'ACTION_REDEEM',
        redemptionMethod: 'REUSABLE_CODE',
      },
      _count: { _all: true },
      _max: { createdAt: true },
    });
    return uses as Array<{
      actionId: string | null;
      _count: { _all: number };
      _max: { createdAt: Date | null };
    }>;
  }

  async findReusableCodeRedemptionPage(
    actionId: string,
    page: number,
    limit: number,
  ) {
    const where = {
      actionId,
      source: 'ACTION_REDEEM' as const,
      redemptionMethod: 'REUSABLE_CODE' as const,
    };
    const [total, rows] = await Promise.all([
      this.client.pointEvent.count({ where }),
      this.client.pointEvent.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          points: true,
          createdAt: true,
          user: { select: { id: true, name: true } },
        },
      }),
    ]);
    return { rows, total };
  }

  findActionIdByCode(code: string) {
    return this.client.action.findUnique({
      where: { code },
      select: { id: true },
    });
  }

  findClaimCodeForRedemption(code: string) {
    return this.client.claimCode.findUnique({
      where: { code },
      include: { action: { select: actionSummarySelect } },
    });
  }

  consumeClaimCode(id: string, userId: string, usedAt: Date) {
    return this.client.claimCode.updateMany({
      where: { id, isUsed: false, isActive: true },
      data: { isUsed: true, isActive: false, usedById: userId, usedAt },
    });
  }

  findClaimCodeState(id: string) {
    return this.client.claimCode.findUnique({
      where: { id },
      select: { isUsed: true, isActive: true },
    });
  }

  async createActionPointEvent(input: {
    id?: string;
    userId: string;
    actionId: string;
    points: number;
    xpDelta: number;
    redemptionMethod: 'DIRECT' | 'REUSABLE_CODE' | 'CLAIM_CODE';
    claimCodeId?: string;
    actorAdminId?: string;
    auditEventId?: string;
    description: string;
    createdAt: Date;
  }) {
    try {
      return await this.client.pointEvent.create({
        data: {
          ...input,
          kind: PointEventKind.CREDIT,
          source: PointEventSource.ACTION_REDEEM,
        },
      });
    } catch (error) {
      this.rethrowUniqueConstraint(error);
    }
  }

  incrementUserProgress(userId: string, points: number, xpDelta: number) {
    return this.client.user.update({
      where: { id: userId },
      data: { points: { increment: points }, xp: { increment: xpDelta } },
      select: userProgressSelect,
    });
  }

  private transactional(tx: Prisma.TransactionClient) {
    const repository = Object.create(
      ActionsRepository.prototype,
    ) as ActionsRepository;
    repository.prisma = this.prisma;
    repository.auditRepository = this.auditRepository;
    repository.client = tx;
    repository.auditWriter = this.auditRepository?.bindTransaction(tx);
    return repository;
  }

  private rethrowUniqueConstraint(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new PersistenceUniqueConstraintError({ cause: error });
    }
    throw error;
  }
}
