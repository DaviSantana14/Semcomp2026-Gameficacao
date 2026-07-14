import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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

type ClaimCodesDatabase = Pick<
  Prisma.TransactionClient,
  'action' | 'claimCode'
>;

export interface ClaimCodePageFilter {
  page: number;
  limit: number;
  search?: string;
  actionId?: string;
  state?: 'available' | 'disabled' | 'blocked' | 'used';
}

@Injectable()
export class ClaimCodesRepository {
  private client: ClaimCodesDatabase;

  constructor(private prisma: PrismaService) {
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
      select: { id: true, name: true },
    });
  }

  insertClaimCodes(actionId: string, codes: string[]) {
    return this.client.claimCode.createManyAndReturn({
      data: codes.map((code) => ({ code, actionId, isActive: true })),
      skipDuplicates: true,
      select: { code: true },
    });
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

  updateClaimCodeStatus(id: string, isActive: boolean) {
    return this.client.claimCode.updateMany({
      where: { id, isUsed: false },
      data: { isActive },
    });
  }

  findClaimCodeById(id: string) {
    return this.client.claimCode.findUnique({
      where: { id },
      select: claimCodeHistorySelect,
    });
  }

  private transactional(tx: Prisma.TransactionClient) {
    const repository = Object.create(
      ClaimCodesRepository.prototype,
    ) as ClaimCodesRepository;
    repository.prisma = this.prisma;
    repository.client = tx;
    return repository;
  }
}
