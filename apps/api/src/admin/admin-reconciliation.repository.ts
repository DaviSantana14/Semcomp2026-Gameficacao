import { Injectable } from '@nestjs/common';
import { PointEventKind, PointEventSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuditRepository,
  TransactionAuditWriter,
} from '../audit/audit.repository';
import { PersistenceUniqueConstraintError } from '../common/persistence-errors';

export { PointEventKind, PointEventSource };

export interface ReconciliationPageFilter {
  page: number;
  limit: number;
  search?: string;
  divergentOnly: boolean;
}

export interface ReconciliationRow {
  participantId: string;
  name: string;
  email: string;
  storedPoints: number;
  storedXp: number;
  ledgerPoints: number;
  ledgerXp: number;
  lastEventAt: Date | null;
}

const compensationEventSelect = {
  id: true,
  userId: true,
  points: true,
  xpDelta: true,
  kind: true,
  source: true,
  actorAdminId: true,
  idempotencyKey: true,
  description: true,
  createdAt: true,
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

export type ReconciliationCompensationEvent = Prisma.PointEventGetPayload<{
  select: typeof compensationEventSelect;
}>;

type ReconciliationDatabase = Pick<
  Prisma.TransactionClient,
  '$queryRaw' | 'pointEvent'
>;

export interface ReconciliationTransaction {
  auditWriter: TransactionAuditWriter;
  lockReconciliation(id: string): Promise<ReconciliationRow | null>;
  findByIdempotencyKey(
    key: string,
  ): Promise<ReconciliationCompensationEvent | null>;
  createPointEvent(input: {
    id: string;
    userId: string;
    points: number;
    xpDelta: number;
    kind: 'CREDIT' | 'DEBIT';
    source: 'ADMIN_ADJUST';
    actorAdminId: string;
    idempotencyKey: string;
    auditEventId: string;
    description: string;
  }): Promise<ReconciliationCompensationEvent>;
}

class BoundReconciliationTransaction implements ReconciliationTransaction {
  readonly auditWriter: TransactionAuditWriter;

  constructor(
    private readonly client: ReconciliationDatabase,
    auditRepository: AuditRepository,
    transaction: Prisma.TransactionClient,
  ) {
    this.auditWriter = auditRepository.bindTransaction(transaction);
  }

  async lockReconciliation(id: string) {
    const participants = await this.client.$queryRaw<
      Array<
        Omit<ReconciliationRow, 'ledgerPoints' | 'ledgerXp' | 'lastEventAt'>
      >
    >(Prisma.sql`
      SELECT
        u."id" AS "participantId", u."name", u."email",
        u."points" AS "storedPoints", u."xp" AS "storedXp"
      FROM "User" u
      WHERE u."id" = ${id} AND u."role" = 'PARTICIPANT'::"UserRole"
      FOR UPDATE
    `);
    const participant = participants[0];
    if (!participant) return null;
    const ledger = await this.client.$queryRaw<
      Array<{
        ledgerPoints: number;
        ledgerXp: number;
        lastEventAt: Date | null;
      }>
    >(Prisma.sql`
      SELECT
        COALESCE(SUM(pe."points"), 0)::integer AS "ledgerPoints",
        COALESCE(SUM(pe."xpDelta"), 0)::integer AS "ledgerXp",
        MAX(pe."createdAt") AS "lastEventAt"
      FROM "PointEvent" pe
      WHERE pe."userId" = ${id}
    `);
    return {
      ...participant,
      ledgerPoints: ledger[0]?.ledgerPoints ?? 0,
      ledgerXp: ledger[0]?.ledgerXp ?? 0,
      lastEventAt: ledger[0]?.lastEventAt ?? null,
    };
  }

  findByIdempotencyKey(key: string) {
    return this.client.pointEvent.findUnique({
      where: { idempotencyKey: key },
      select: compensationEventSelect,
    });
  }

  createPointEvent(
    input: Parameters<ReconciliationTransaction['createPointEvent']>[0],
  ) {
    return this.client.pointEvent.create({
      data: input,
      select: compensationEventSelect,
    });
  }
}

type CountRow = { total: bigint };

@Injectable()
export class AdminReconciliationRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditRepository: AuditRepository,
  ) {}

  async withTransaction<T>(
    callback: (transaction: ReconciliationTransaction) => Promise<T>,
  ) {
    try {
      return await this.prisma.$transaction(
        (transaction) =>
          callback(
            new BoundReconciliationTransaction(
              transaction,
              this.auditRepository,
              transaction,
            ),
          ),
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        String(error.meta?.target).includes('idempotencyKey')
      ) {
        throw new PersistenceUniqueConstraintError({ cause: error });
      }
      throw error;
    }
  }

  findByIdempotencyKey(key: string) {
    return this.prisma.pointEvent.findUnique({
      where: { idempotencyKey: key },
      select: compensationEventSelect,
    });
  }

  async findPage(filter: ReconciliationPageFilter) {
    const predicates = this.predicates(filter.search, filter.divergentOnly);
    const common = this.reconciliationRelation();
    const [countRows, rows] = await Promise.all([
      this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
        ${common}
        SELECT COUNT(*)::bigint AS total
        FROM reconciliation
        ${predicates}
      `),
      this.prisma.$queryRaw<ReconciliationRow[]>(Prisma.sql`
        ${common}
        SELECT
          "participantId",
          name,
          email,
          "storedPoints",
          "storedXp",
          "ledgerPoints",
          "ledgerXp",
          "lastEventAt"
        FROM reconciliation
        ${predicates}
        ORDER BY "participantCreatedAt" DESC, "participantId" DESC
        LIMIT ${filter.limit}
        OFFSET ${(filter.page - 1) * filter.limit}
      `),
    ]);
    return { total: Number(countRows[0]?.total ?? 0), rows };
  }

  async countDivergent() {
    const rows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      ${this.reconciliationRelation()}
      SELECT COUNT(*)::bigint AS total
      FROM reconciliation
      WHERE "storedPoints" <> "ledgerPoints"
         OR "storedXp" <> "ledgerXp"
    `);
    return Number(rows[0]?.total ?? 0);
  }

  async findByParticipantId(id: string) {
    const rows = await this.prisma.$queryRaw<ReconciliationRow[]>(Prisma.sql`
      ${this.reconciliationRelation()}
      SELECT
        "participantId",
        name,
        email,
        "storedPoints",
        "storedXp",
        "ledgerPoints",
        "ledgerXp",
        "lastEventAt"
      FROM reconciliation
      WHERE "participantId" = ${id}
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private reconciliationRelation() {
    return Prisma.sql`
      WITH ledger AS (
        SELECT
          pe."userId",
          SUM(pe."points")::integer AS "ledgerPoints",
          SUM(pe."xpDelta")::integer AS "ledgerXp",
          MAX(pe."createdAt") AS "lastEventAt"
        FROM "PointEvent" pe
        GROUP BY pe."userId"
      ),
      reconciliation AS (
        SELECT
          u."id" AS "participantId",
          u."name" AS name,
          u."email" AS email,
          u."cpf" AS cpf,
          u."points" AS "storedPoints",
          u."xp" AS "storedXp",
          COALESCE(ledger."ledgerPoints", 0)::integer AS "ledgerPoints",
          COALESCE(ledger."ledgerXp", 0)::integer AS "ledgerXp",
          ledger."lastEventAt" AS "lastEventAt",
          u."createdAt" AS "participantCreatedAt"
        FROM "User" u
        LEFT JOIN ledger ON ledger."userId" = u."id"
        WHERE u."role" = 'PARTICIPANT'
      )
    `;
  }

  private predicates(search: string | undefined, divergentOnly: boolean) {
    const clauses: Prisma.Sql[] = [];
    if (search) {
      const pattern = `%${search}%`;
      clauses.push(
        Prisma.sql`(name ILIKE ${pattern} OR email ILIKE ${pattern} OR cpf ILIKE ${pattern})`,
      );
    }
    if (divergentOnly) {
      clauses.push(
        Prisma.sql`("storedPoints" <> "ledgerPoints" OR "storedXp" <> "ledgerXp")`,
      );
    }
    return clauses.length
      ? Prisma.sql`WHERE ${Prisma.join(clauses, ' AND ')}`
      : Prisma.empty;
  }
}
