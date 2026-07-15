import { Injectable } from '@nestjs/common';
import {
  AuditActorType,
  AuditEntityType,
  AuditOperation,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isCanonicalClaimCodeMask } from '../common/claim-code-mask';

export { AuditActorType, AuditEntityType, AuditOperation };
export type AuditJsonValue = Prisma.InputJsonValue;

const auditEventSelect = {
  id: true,
  actorType: true,
  actorAdminId: true,
  actorDisplayName: true,
  actorDisplayEmail: true,
  participantId: true,
  participantDisplayName: true,
  participantDisplayEmail: true,
  operation: true,
  entityType: true,
  entityId: true,
  entityDisplayName: true,
  reason: true,
  before: true,
  after: true,
  metadata: true,
  requestId: true,
  createdAt: true,
} as const;

type AuditDatabase = Pick<
  Prisma.TransactionClient,
  'adminAuditEvent' | 'user' | 'action' | 'reward' | 'rewardRedemption'
>;

export interface AuditPageFilter {
  page: number;
  limit: number;
  actorType?: AuditActorType;
  actorAdminId?: string;
  actorSearch?: string;
  operation?: AuditOperation;
  entityType?: AuditEntityType;
  entityId?: string;
  entitySearch?: string;
  participantId?: string;
  participantSearch?: string;
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

  async create(data: AuditWriteData) {
    const [actor, participant, entityDisplayName] = await Promise.all([
      data.actorType === AuditActorType.ADMIN && data.actorAdminId
        ? this.client.user.findUnique({
            where: { id: data.actorAdminId },
            select: { name: true, email: true },
          })
        : Promise.resolve(null),
      data.participantId
        ? this.client.user.findUnique({
            where: { id: data.participantId },
            select: { name: true, email: true },
          })
        : Promise.resolve(null),
      this.resolveEntityDisplayName(data),
    ]);

    return this.client.adminAuditEvent.create({
      data: {
        ...data,
        actorDisplayName:
          data.actorType === AuditActorType.SYSTEM
            ? 'Sistema'
            : (actor?.name ?? `Administrador ${data.actorAdminId}`),
        actorDisplayEmail: actor?.email ?? null,
        participantDisplayName: data.participantId
          ? (participant?.name ?? `Participante ${data.participantId}`)
          : null,
        participantDisplayEmail: participant?.email ?? null,
        entityDisplayName,
      },
      select: auditEventSelect,
    });
  }

  private async resolveEntityDisplayName(data: AuditWriteData) {
    switch (data.entityType) {
      case AuditEntityType.PARTICIPANT: {
        const user = await this.client.user.findUnique({
          where: { id: data.entityId },
          select: { name: true },
        });
        return user?.name ?? `Participante ${data.entityId}`;
      }
      case AuditEntityType.ACTION: {
        const action = await this.client.action.findUnique({
          where: { id: data.entityId },
          select: { name: true },
        });
        return action?.name ?? `Atividade ${data.entityId}`;
      }
      case AuditEntityType.CLAIM_CODE_BATCH:
        return `Lote de códigos ${data.entityId}`;
      case AuditEntityType.CLAIM_CODE: {
        const maskedCode =
          this.readMaskedCode(data.after) ?? this.readMaskedCode(data.before);
        return maskedCode ? `Código ${maskedCode}` : `Código ${data.entityId}`;
      }
      case AuditEntityType.REWARD: {
        const reward = await this.client.reward.findUnique({
          where: { id: data.entityId },
          select: { name: true },
        });
        return reward?.name ?? `Recompensa ${data.entityId}`;
      }
      case AuditEntityType.REWARD_REDEMPTION: {
        const redemption = await this.client.rewardRedemption.findUnique({
          where: { id: data.entityId },
          select: { reward: { select: { name: true } } },
        });
        return redemption?.reward.name
          ? `Resgate de ${redemption.reward.name}`
          : `Resgate ${data.entityId}`;
      }
      case AuditEntityType.POINT_EVENT:
        return `Evento de pontos ${data.entityId}`;
      case AuditEntityType.RECONCILIATION:
        return `Reconciliação ${data.entityId}`;
    }
  }

  private readMaskedCode(value: Prisma.InputJsonValue | undefined) {
    if (!value || Array.isArray(value) || typeof value !== 'object')
      return null;
    const maskedCode = (value as { maskedCode?: unknown }).maskedCode;
    return isCanonicalClaimCodeMask(maskedCode) ? maskedCode : null;
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
    const humanFilters: Prisma.AdminAuditEventWhereInput[] = [];
    if (filter.actorSearch) {
      humanFilters.push({
        OR: [
          {
            actorDisplayName: {
              contains: filter.actorSearch,
              mode: 'insensitive',
            },
          },
          {
            actorDisplayEmail: {
              contains: filter.actorSearch,
              mode: 'insensitive',
            },
          },
        ],
      });
    }
    if (filter.participantSearch) {
      humanFilters.push({
        OR: [
          {
            participantDisplayName: {
              contains: filter.participantSearch,
              mode: 'insensitive',
            },
          },
          {
            participantDisplayEmail: {
              contains: filter.participantSearch,
              mode: 'insensitive',
            },
          },
        ],
      });
    }
    if (filter.entitySearch) {
      humanFilters.push({
        entityDisplayName: {
          contains: filter.entitySearch,
          mode: 'insensitive',
        },
      });
    }
    const where: Prisma.AdminAuditEventWhereInput = {
      ...(humanFilters.length > 0 && { AND: humanFilters }),
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
