import { Injectable, Optional } from '@nestjs/common';
import {
  ActionRedemptionMethod,
  PointEventSource,
  Prisma,
} from '@prisma/client';
import {
  buildPointEventWhere,
  pointEventSelect,
  type PointEventFilter,
} from '../admin/admin-participants.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuditRepository,
  TransactionAuditWriter,
} from '../audit/audit.repository';
import { ClaimCodeBulkOutcome } from './claim-code-bulk-outcome';

const claimCodeHistorySelect = {
  id: true,
  code: true,
  isActive: true,
  isUsed: true,
  createdAt: true,
  usedAt: true,
  action: { select: { id: true, name: true, isActive: true } },
  usedBy: { select: { id: true, name: true, email: true } },
} as const;

const claimCodeBatchSelect = {
  id: true,
  actionId: true,
  createdByAdminId: true,
  requestedQuantity: true,
  createdQuantity: true,
  reason: true,
  requestId: true,
  createdAt: true,
  action: { select: { id: true, name: true, isActive: true } },
  createdByAdmin: { select: { id: true, name: true, email: true } },
} as const;

const claimCodeBulkOperationSummarySelect = {
  id: true,
  actorAdminId: true,
  targetIsActive: true,
  reason: true,
  requestId: true,
  selectedCount: true,
  changedCount: true,
  unchangedCount: true,
  usedCount: true,
  notFoundCount: true,
  createdAt: true,
  actorAdmin: { select: { id: true, name: true, email: true } },
} as const;

const claimCodeBulkOperationItemSelect = {
  requestedClaimCodeId: true,
  claimCodeId: true,
  maskedCode: true,
  outcome: true,
} as const;

const claimCodeBulkOperationDetailSelect = {
  ...claimCodeBulkOperationSummarySelect,
  items: {
    select: claimCodeBulkOperationItemSelect,
    orderBy: { requestedClaimCodeId: 'asc' },
  },
} as const;

const emptyBatchCounts = () => ({
  available: 0,
  disabled: 0,
  used: 0,
  blocked: 0,
});

type ClaimCodeBatchRecord = Prisma.ClaimCodeBatchGetPayload<{
  select: typeof claimCodeBatchSelect;
}>;

type ClaimCodeBulkOperationRecord = Prisma.ClaimCodeBulkOperationGetPayload<{
  select: typeof claimCodeBulkOperationDetailSelect;
}>;

export type LockedClaimCode = {
  id: string;
  code: string;
  isActive: boolean;
  isUsed: boolean;
};

export type ClaimCodeBatchRecordWithCounts = ClaimCodeBatchRecord & {
  counts: ReturnType<typeof emptyBatchCounts>;
};

type ClaimCodesDatabase = Pick<
  Prisma.TransactionClient,
  | '$queryRaw'
  | 'action'
  | 'claimCode'
  | 'claimCodeBatch'
  | 'claimCodeBulkOperation'
  | 'pointEvent'
>;

export interface ClaimCodePageFilter {
  page: number;
  limit: number;
  search?: string;
  actionId?: string;
  state?: 'available' | 'disabled' | 'blocked' | 'used';
}

export interface ClaimCodeBatchCreateInput {
  id: string;
  actionId: string;
  createdByAdminId: string;
  requestedQuantity: number;
  createdQuantity: number;
  reason: string;
  requestId: string;
}

export interface ClaimCodeBatchPageFilter {
  page: number;
  limit: number;
  actionId?: string;
  actorAdminId?: string;
  from?: Date;
  to?: Date;
}

export interface ClaimCodeBulkOperationPageFilter {
  page: number;
  limit: number;
  actorAdminId?: string;
  targetIsActive?: boolean;
  from?: Date;
  to?: Date;
}

export interface ClaimCodeBulkOperationCreateInput {
  id: string;
  actorAdminId: string;
  targetIsActive: boolean;
  reason: string;
  requestId: string;
  selectedCount: number;
  changedCount: number;
  unchangedCount: number;
  usedCount: number;
  notFoundCount: number;
  items: Array<{
    requestedClaimCodeId: string;
    claimCodeId: string | null;
    maskedCode: string | null;
    outcome: ClaimCodeBulkOutcome;
  }>;
}

export interface CodeRedemptionFilter extends Pick<
  PointEventFilter,
  'page' | 'limit' | 'search' | 'from' | 'to'
> {
  actionId?: string;
  method?: Extract<ActionRedemptionMethod, 'REUSABLE_CODE' | 'CLAIM_CODE'>;
}

export function buildCodeRedemptionWhere(
  filter: CodeRedemptionFilter,
): Prisma.PointEventWhereInput {
  return {
    ...buildPointEventWhere({
      page: filter.page,
      limit: filter.limit,
      search: filter.search,
      actionId: filter.actionId,
      source: PointEventSource.ACTION_REDEEM,
      method: filter.method,
      from: filter.from,
      to: filter.to,
    }),
    redemptionMethod: filter.method
      ? filter.method
      : {
          in: [
            ActionRedemptionMethod.REUSABLE_CODE,
            ActionRedemptionMethod.CLAIM_CODE,
          ],
        },
  };
}

const codeRedemptionSelect = {
  ...pointEventSelect,
} as const;

export type CodeRedemptionRecord = Prisma.PointEventGetPayload<{
  select: typeof codeRedemptionSelect;
}>;

@Injectable()
export class ClaimCodesRepository {
  private client: ClaimCodesDatabase;
  auditWriter?: TransactionAuditWriter;

  constructor(
    private prisma: PrismaService,
    @Optional() private auditRepository?: AuditRepository,
  ) {
    this.client = prisma;
  }

  withTransaction<T>(
    callback: (
      repository: ClaimCodesRepository,
      transaction: Prisma.TransactionClient,
    ) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction((tx) =>
      callback(this.transactional(tx), tx),
    );
  }

  findActionForCodeBatch(actionId: string) {
    return this.client.action.findUnique({
      where: { id: actionId },
      select: { id: true, name: true, isActive: true },
    });
  }

  createBatch(input: ClaimCodeBatchCreateInput) {
    return this.client.claimCodeBatch.create({
      data: input,
      select: claimCodeBatchSelect,
    });
  }

  insertClaimCodes(actionId: string, batchId: string, codes: string[]) {
    return this.client.claimCode.createManyAndReturn({
      data: codes.map((code) => ({
        code,
        actionId,
        batchId,
        isActive: true,
      })),
      skipDuplicates: true,
      select: { id: true, code: true },
    });
  }

  async findBatches(filter: ClaimCodeBatchPageFilter) {
    const where = this.buildBatchWhere(filter);
    const [total, rows] = await Promise.all([
      this.client.claimCodeBatch.count({ where }),
      this.client.claimCodeBatch.findMany({
        where,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: claimCodeBatchSelect,
      }),
    ]);

    return { rows: await this.withBatchCounts(rows), total };
  }

  async findBatch(id: string) {
    const row = await this.client.claimCodeBatch.findUnique({
      where: { id },
      select: claimCodeBatchSelect,
    });
    if (!row) return null;
    const [withCounts] = await this.withBatchCounts([row]);
    return withCounts ?? null;
  }

  async getBatchCodes(id: string) {
    const batch = await this.client.claimCodeBatch.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!batch) return null;

    const rows = await this.client.claimCode.findMany({
      where: { batchId: id },
      orderBy: { code: 'asc' },
      select: { code: true },
    });
    return rows.map(({ code }) => code);
  }

  async findBatchQrArtifact(id: string) {
    const batch = await this.client.claimCodeBatch.findUnique({
      where: { id },
      select: { id: true, action: { select: { name: true } } },
    });
    if (!batch) return null;

    const rows = await this.client.claimCode.findMany({
      where: { batchId: id },
      orderBy: { code: 'asc' },
      select: { code: true },
    });
    return {
      id: batch.id,
      actionName: batch.action.name,
      codes: rows.map(({ code }) => code),
    };
  }

  async findClaimCodePage(filter: ClaimCodePageFilter) {
    const where: Prisma.ClaimCodeWhereInput = {};
    if (filter.actionId) where.actionId = filter.actionId;
    if (filter.search) where.code = { contains: filter.search };
    if (filter.state === 'available') {
      Object.assign(where, {
        isUsed: false,
        isActive: true,
        action: { isActive: true },
      });
    }
    if (filter.state === 'disabled') {
      Object.assign(where, { isUsed: false, isActive: false });
    }
    if (filter.state === 'blocked') {
      Object.assign(where, {
        isUsed: false,
        isActive: true,
        action: { isActive: false },
      });
    }
    if (filter.state === 'used') where.isUsed = true;
    const [total, rows] = await Promise.all([
      this.client.claimCode.count({ where }),
      this.client.claimCode.findMany({
        where,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: claimCodeHistorySelect,
      }),
    ]);
    return { rows, total };
  }

  async findCodeRedemptionPage(filter: CodeRedemptionFilter) {
    const where = buildCodeRedemptionWhere(filter);
    const [total, rows] = await Promise.all([
      this.client.pointEvent.count({ where }),
      this.client.pointEvent.findMany({
        where,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: codeRedemptionSelect,
      }),
    ]);
    return { rows, total };
  }

  updateClaimCodeStatus(
    id: string,
    isActive: boolean,
    previousIsActive: boolean,
  ) {
    return this.client.claimCode.updateMany({
      where: { id, isUsed: false, isActive: previousIsActive },
      data: { isActive },
    });
  }

  async lockClaimCodes(ids: string[]): Promise<LockedClaimCode[]> {
    if (ids.length === 0) return [];

    return this.client.$queryRaw<LockedClaimCode[]>(Prisma.sql`
      SELECT "id", "code", "isActive", "isUsed"
      FROM "ClaimCode"
      WHERE "id" IN (${Prisma.join(ids)})
      ORDER BY "id"
      FOR UPDATE
    `);
  }

  updateClaimCodeStatuses(ids: string[], isActive: boolean) {
    if (ids.length === 0) return Promise.resolve({ count: 0 });

    return this.client.claimCode.updateMany({
      where: {
        id: { in: ids },
        isUsed: false,
        isActive: { not: isActive },
      },
      data: { isActive },
    });
  }

  createBulkOperation(input: ClaimCodeBulkOperationCreateInput) {
    return this.client.claimCodeBulkOperation.create({
      data: {
        id: input.id,
        actorAdminId: input.actorAdminId,
        targetIsActive: input.targetIsActive,
        reason: input.reason,
        requestId: input.requestId,
        selectedCount: input.selectedCount,
        changedCount: input.changedCount,
        unchangedCount: input.unchangedCount,
        usedCount: input.usedCount,
        notFoundCount: input.notFoundCount,
        items: {
          create: input.items.map((item) => ({
            ...item,
            outcome: item.outcome,
          })),
        },
      },
      select: claimCodeBulkOperationDetailSelect,
    });
  }

  async findBulkOperations(filter: ClaimCodeBulkOperationPageFilter) {
    const where = this.buildBulkOperationWhere(filter);
    const [total, rows] = await Promise.all([
      this.client.claimCodeBulkOperation.count({ where }),
      this.client.claimCodeBulkOperation.findMany({
        where,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: claimCodeBulkOperationSummarySelect,
      }),
    ]);

    return { rows, total };
  }

  findBulkOperation(id: string): Promise<ClaimCodeBulkOperationRecord | null> {
    return this.client.claimCodeBulkOperation.findUnique({
      where: { id },
      select: claimCodeBulkOperationDetailSelect,
    });
  }

  async findBulkReport(id: string) {
    const row = await this.client.claimCodeBulkOperation.findUnique({
      where: { id },
      select: {
        id: true,
        items: {
          select: claimCodeBulkOperationItemSelect,
          orderBy: { requestedClaimCodeId: 'asc' },
        },
      },
    });
    return row;
  }

  findClaimCodeById(id: string) {
    return this.client.claimCode.findUnique({
      where: { id },
      select: claimCodeHistorySelect,
    });
  }

  private buildBatchWhere(
    filter: ClaimCodeBatchPageFilter,
  ): Prisma.ClaimCodeBatchWhereInput {
    return {
      ...(filter.actionId && { actionId: filter.actionId }),
      ...(filter.actorAdminId && { createdByAdminId: filter.actorAdminId }),
      ...((filter.from || filter.to) && {
        createdAt: {
          ...(filter.from && { gte: filter.from }),
          ...(filter.to && { lte: filter.to }),
        },
      }),
    };
  }

  private buildBulkOperationWhere(
    filter: ClaimCodeBulkOperationPageFilter,
  ): Prisma.ClaimCodeBulkOperationWhereInput {
    return {
      ...(filter.actorAdminId && { actorAdminId: filter.actorAdminId }),
      ...(filter.targetIsActive !== undefined && {
        targetIsActive: filter.targetIsActive,
      }),
      ...((filter.from || filter.to) && {
        createdAt: {
          ...(filter.from && { gte: filter.from }),
          ...(filter.to && { lte: filter.to }),
        },
      }),
    };
  }

  private async withBatchCounts(rows: ClaimCodeBatchRecord[]) {
    if (rows.length === 0) return [] as ClaimCodeBatchRecordWithCounts[];

    const grouped = await this.client.claimCode.groupBy({
      by: ['batchId', 'isUsed', 'isActive'],
      where: { batchId: { in: rows.map(({ id }) => id) } },
      _count: { _all: true },
    });
    const countsByBatch = new Map<
      string,
      ReturnType<typeof emptyBatchCounts>
    >();

    for (const group of grouped) {
      if (!group.batchId) continue;
      const counts = countsByBatch.get(group.batchId) ?? emptyBatchCounts();
      const count = group._count._all;
      if (group.isUsed) {
        counts.used += count;
      } else if (!group.isActive) {
        counts.disabled += count;
      } else {
        const row = rows.find(({ id }) => id === group.batchId);
        if (row?.action.isActive) counts.available += count;
        else counts.blocked += count;
      }
      countsByBatch.set(group.batchId, counts);
    }

    return rows.map((row) => ({
      ...row,
      counts: countsByBatch.get(row.id) ?? emptyBatchCounts(),
    }));
  }

  private transactional(tx: Prisma.TransactionClient) {
    const repository = Object.create(
      ClaimCodesRepository.prototype,
    ) as ClaimCodesRepository;
    repository.prisma = this.prisma;
    repository.auditRepository = this.auditRepository;
    repository.client = tx;
    repository.auditWriter = this.auditRepository?.bindTransaction(tx);
    return repository;
  }
}
