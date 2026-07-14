import { Injectable } from '@nestjs/common';
import {
  PointEventKind,
  PointEventSource,
  Prisma,
  UserRole,
} from '@prisma/client';
import {
  AuditRepository,
  TransactionAuditWriter,
} from '../audit/audit.repository';
import { PersistenceUniqueConstraintError } from '../common/persistence-errors';
import { PrismaService } from '../prisma/prisma.service';

export { PointEventKind, PointEventSource };

const idempotentEventSelect = {
  id: true,
  userId: true,
  points: true,
  xpDelta: true,
  kind: true,
  source: true,
  actorAdminId: true,
  idempotencyKey: true,
  description: true,
  reversedEventId: true,
  createdAt: true,
  reversal: { select: { id: true } },
  auditEvent: {
    select: {
      id: true,
      operation: true,
      reason: true,
      before: true,
      after: true,
      requestId: true,
      createdAt: true,
    },
  },
} as const;

type AdjustmentDatabase = Pick<
  Prisma.TransactionClient,
  'user' | 'pointEvent' | '$queryRaw'
>;

export type LockedParticipant = {
  id: string;
  points: number;
  xp: number;
  level: number;
  isActive: boolean;
  role: UserRole;
};

export type IdempotentAdjustmentEvent = Prisma.PointEventGetPayload<{
  select: typeof idempotentEventSelect;
}>;

export interface CreateAdjustmentPointEventInput {
  id: string;
  userId: string;
  points: number;
  xpDelta: number;
  kind: PointEventKind;
  source: PointEventSource;
  actorAdminId: string;
  idempotencyKey: string;
  auditEventId: string;
  description: string;
  reversedEventId?: string;
}

export interface AdminAdjustmentTransaction {
  auditWriter: TransactionAuditWriter;
  lockParticipant(id: string): Promise<LockedParticipant | null>;
  lockPointEvent(id: string): Promise<IdempotentAdjustmentEvent | null>;
  findByIdempotencyKey(key: string): Promise<IdempotentAdjustmentEvent | null>;
  createPointEvent(
    input: CreateAdjustmentPointEventInput,
  ): Promise<IdempotentAdjustmentEvent>;
  updateParticipantBalance(
    id: string,
    pointsDelta: number,
    xpDelta: number,
  ): Promise<{ id: string; points: number; xp: number; level: number }>;
}

class BoundAdminAdjustmentTransaction implements AdminAdjustmentTransaction {
  readonly auditWriter: TransactionAuditWriter;

  constructor(
    private readonly client: AdjustmentDatabase,
    auditRepository: AuditRepository,
    transaction: Prisma.TransactionClient,
  ) {
    this.auditWriter = auditRepository.bindTransaction(transaction);
  }

  async lockParticipant(id: string) {
    const rows = await this.client.$queryRaw<LockedParticipant[]>`
      SELECT "id", "points", "xp", "level", "isActive", "role"
      FROM "User"
      WHERE "id" = ${id} AND "role" = 'PARTICIPANT'::"UserRole"
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  async lockPointEvent(id: string) {
    const rows = await this.client.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "PointEvent" WHERE "id" = ${id} FOR UPDATE
    `;
    if (!rows[0]) return null;
    return this.client.pointEvent.findUnique({
      where: { id },
      select: idempotentEventSelect,
    });
  }

  findByIdempotencyKey(key: string) {
    return this.client.pointEvent.findUnique({
      where: { idempotencyKey: key },
      select: idempotentEventSelect,
    });
  }

  createPointEvent(input: CreateAdjustmentPointEventInput) {
    return this.client.pointEvent.create({
      data: input,
      select: idempotentEventSelect,
    });
  }

  updateParticipantBalance(id: string, pointsDelta: number, xpDelta: number) {
    return this.client.user.update({
      where: { id },
      data: {
        points: { increment: pointsDelta },
        xp: { increment: xpDelta },
      },
      select: { id: true, points: true, xp: true, level: true },
    });
  }
}

@Injectable()
export class AdminAdjustmentsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditRepository: AuditRepository,
  ) {}

  async withTransaction<T>(
    callback: (transaction: AdminAdjustmentTransaction) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(
        (transaction) =>
          callback(
            new BoundAdminAdjustmentTransaction(
              transaction,
              this.auditRepository,
              transaction,
            ),
          ),
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      this.rethrowExpectedUniqueConstraint(error);
    }
  }

  findByIdempotencyKey(key: string) {
    return this.prisma.pointEvent.findUnique({
      where: { idempotencyKey: key },
      select: idempotentEventSelect,
    });
  }

  findReversalByOriginalId(originalId: string) {
    return this.prisma.pointEvent.findUnique({
      where: { reversedEventId: originalId },
      select: idempotentEventSelect,
    });
  }

  private rethrowExpectedUniqueConstraint(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      isExpectedPointEventUniqueTarget(error.meta?.target)
    ) {
      throw new PersistenceUniqueConstraintError({ cause: error });
    }
    throw error;
  }
}

function isExpectedPointEventUniqueTarget(target: unknown) {
  const names = Array.isArray(target) ? target : [target];
  return names.some(
    (name) =>
      typeof name === 'string' &&
      (name.includes('idempotencyKey') || name.includes('reversedEventId')),
  );
}
