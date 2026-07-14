import { Injectable } from '@nestjs/common';
import {
  AuditActorType,
  AuditEntityType,
  AuditOperation,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export { AuditActorType, AuditEntityType, AuditOperation };
export type AuditJsonValue = Prisma.InputJsonValue;

const auditEventSelect = {
  id: true,
  actorType: true,
  actorAdminId: true,
  participantId: true,
  operation: true,
  entityType: true,
  entityId: true,
  reason: true,
  before: true,
  after: true,
  metadata: true,
  requestId: true,
  createdAt: true,
} as const;

type AuditDatabase = Pick<Prisma.TransactionClient, 'adminAuditEvent'>;

export interface AuditPageFilter {
  page: number;
  limit: number;
  actorType?: AuditActorType;
  actorAdminId?: string;
  operation?: AuditOperation;
  entityType?: AuditEntityType;
  entityId?: string;
  participantId?: string;
  requestId?: string;
  from?: Date;
  to?: Date;
}

export interface AuditWriteData {
  actorType: AuditActorType;
  actorAdminId: string | null;
  participantId: string | null;
  operation: AuditOperation;
  entityType: AuditEntityType;
  entityId: string;
  reason: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  requestId: string;
}

export interface TransactionAuditWriter {
  create(data: AuditWriteData): Promise<AuditEventRecord>;
}

export type AuditEventRecord = Prisma.AdminAuditEventGetPayload<{
  select: typeof auditEventSelect;
}>;

class BoundTransactionAuditWriter implements TransactionAuditWriter {
  constructor(private readonly client: AuditDatabase) {}

  create(data: AuditWriteData) {
    return this.client.adminAuditEvent.create({
      data,
      select: auditEventSelect,
    });
  }
}

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  bindTransaction(
    transaction: Prisma.TransactionClient,
  ): TransactionAuditWriter {
    return new BoundTransactionAuditWriter(transaction);
  }

  async findPage(filter: AuditPageFilter) {
    const where: Prisma.AdminAuditEventWhereInput = {
      ...(filter.actorType && { actorType: filter.actorType }),
      ...(filter.actorAdminId && { actorAdminId: filter.actorAdminId }),
      ...(filter.operation && { operation: filter.operation }),
      ...(filter.entityType && { entityType: filter.entityType }),
      ...(filter.entityId && { entityId: filter.entityId }),
      ...(filter.participantId && { participantId: filter.participantId }),
      ...(filter.requestId && { requestId: filter.requestId }),
      ...((filter.from || filter.to) && {
        createdAt: {
          ...(filter.from && { gte: filter.from }),
          ...(filter.to && { lte: filter.to }),
        },
      }),
    };
    const [total, rows] = await Promise.all([
      this.prisma.adminAuditEvent.count({ where }),
      this.prisma.adminAuditEvent.findMany({
        where,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: auditEventSelect,
      }),
    ]);
    return { rows, total };
  }
}
