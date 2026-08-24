import { Injectable, Optional } from '@nestjs/common';
import { AdminProfile, Prisma, UserRole } from '@prisma/client';
import {
  AuditRepository,
  TransactionAuditWriter,
} from '../audit/audit.repository';
import { PersistenceUniqueConstraintError } from '../common/persistence-errors';
import { PrismaService } from '../prisma/prisma.service';

type OperatorClient = PrismaService | Prisma.TransactionClient;

const operatorSelect = (now: Date) =>
  ({
    id: true,
    name: true,
    cpf: true,
    email: true,
    role: true,
    adminProfile: true,
    isActive: true,
    passwordHash: true,
    passwordChangedAt: true,
    lastLoginAt: true,
    createdAt: true,
    updatedAt: true,
    adminActivations: {
      where: {
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' as const },
      take: 1,
      select: { expiresAt: true },
    },
  }) as const;

export type AdminOperatorRecord = {
  id: string;
  name: string;
  cpf: string;
  email: string;
  role: UserRole;
  adminProfile: AdminProfile;
  isActive: boolean;
  passwordHash: string | null;
  passwordChangedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  activationExpiresAt: Date | null;
};

export type AdminOperatorPageFilter = {
  page: number;
  limit: number;
  search?: string;
  adminProfile?: AdminProfile;
  state?: 'PENDING_ACTIVATION' | 'ACTIVE' | 'INACTIVE';
};

export type CreateOperatorPersistenceInput = {
  name: string;
  cpf: string;
  email: string;
  adminProfile: AdminProfile;
  codeHash: string;
  expiresAt: Date;
  createdByAdminId: string;
};

export type UpdateOperatorPersistenceInput = {
  name?: string;
  cpf?: string;
  email?: string;
  adminProfile?: AdminProfile;
  isActive?: boolean;
};

export type ResetOperatorPersistenceInput = {
  id: string;
  codeHash: string;
  expiresAt: Date;
  createdByAdminId: string;
};

export type ActivateOperatorPersistenceInput = {
  codeHash: string;
  cpf: string;
  email: string;
  passwordHash: string;
  now: Date;
};

@Injectable()
export class AdminOperatorsRepository {
  private client: OperatorClient;
  auditWriter?: TransactionAuditWriter;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly auditRepository?: AuditRepository,
  ) {
    this.client = prisma;
  }

  withTransaction<T>(
    callback: (repository: AdminOperatorsRepository) => Promise<T>,
  ) {
    return this.prisma.$transaction((tx) => callback(this.transactional(tx)));
  }

  async findOperatorPage(filter: AdminOperatorPageFilter) {
    const where = buildOperatorWhere(filter);
    const select = operatorSelect(new Date());
    const [total, rows] = await Promise.all([
      this.client.user.count({ where }),
      this.client.user.findMany({
        where,
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select,
      }),
    ]);

    return {
      total,
      rows: rows.map((row) => toOperatorRecord(row)),
    };
  }

  async findOperatorById(id: string) {
    const row = await this.client.user.findFirst({
      where: { id, role: UserRole.ADMIN },
      select: operatorSelect(new Date()),
    });
    return row ? toOperatorRecord(row) : null;
  }

  async lockAvailableGenerals() {
    return this.client.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "User"
        WHERE "role" = 'ADMIN'::"UserRole"
          AND "adminProfile" = 'GENERAL'::"AdminProfile"
          AND "isActive" = TRUE
          AND "passwordHash" IS NOT NULL
        ORDER BY "id"
        FOR UPDATE
      `;
  }

  async lockOperator(id: string) {
    const locked = await this.client.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "User"
        WHERE "id" = ${id}
          AND "role" = 'ADMIN'::"UserRole"
        FOR UPDATE
      `;
    if (locked.length === 0) return null;

    const row = await this.client.user.findUnique({
      where: { id },
      select: operatorSelect(new Date()),
    });
    return row ? toOperatorRecord(row) : null;
  }

  async createOperator(input: CreateOperatorPersistenceInput) {
    try {
      const created = await this.client.user.create({
        data: {
          name: input.name,
          cpf: input.cpf,
          email: input.email,
          role: UserRole.ADMIN,
          adminProfile: input.adminProfile,
          isActive: true,
          passwordHash: null,
          passwordResetRequired: false,
          passwordResetExpiresAt: null,
          adminActivations: {
            create: {
              codeHash: input.codeHash,
              expiresAt: input.expiresAt,
              createdByAdminId: input.createdByAdminId,
            },
          },
        },
        select: operatorSelect(new Date()),
      });
      return toOperatorRecord({
        ...created,
        adminActivations: [{ expiresAt: input.expiresAt }],
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new PersistenceUniqueConstraintError({ cause: error });
      }
      throw error;
    }
  }

  async updateOperator(id: string, input: UpdateOperatorPersistenceInput) {
    try {
      const updated = await this.client.user.update({
        where: { id },
        data: input,
        select: operatorSelect(new Date()),
      });
      return toOperatorRecord(updated);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new PersistenceUniqueConstraintError({ cause: error });
      }
      throw error;
    }
  }

  async revokeOpenSessions(id: string, now: Date) {
    const result = await this.client.userSession.updateMany({
      where: {
        userId: id,
        endedAt: null,
        expiresAt: { gt: now },
      },
      data: { endedAt: now, endReason: 'REVOKED' },
    });
    return result.count;
  }

  revokePendingActivations(id: string, now: Date) {
    return this.client.adminActivation
      .updateMany({
        where: { adminUserId: id, usedAt: null, revokedAt: null },
        data: { revokedAt: now },
      })
      .then((result) => result.count);
  }

  async resetOperator(input: ResetOperatorPersistenceInput) {
    try {
      await this.client.user.update({
        where: { id: input.id },
        data: {
          passwordHash: null,
          passwordChangedAt: null,
          isActive: true,
          passwordResetRequired: false,
          passwordResetExpiresAt: null,
        },
      });
      await this.client.adminActivation.create({
        data: {
          adminUserId: input.id,
          codeHash: input.codeHash,
          expiresAt: input.expiresAt,
          createdByAdminId: input.createdByAdminId,
        },
      });
      const updated = await this.findOperatorById(input.id);
      if (!updated) throw new Error('Operator disappeared during reset.');
      return updated;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new PersistenceUniqueConstraintError({ cause: error });
      }
      throw error;
    }
  }

  async consumeActivation(input: ActivateOperatorPersistenceInput) {
    const activations = await this.client.$queryRaw<
      Array<{ id: string; adminUserId: string }>
    >`
        SELECT "id", "adminUserId"
        FROM "AdminActivation"
        WHERE "codeHash" = ${input.codeHash}
      `;
    const activationId = activations[0]?.id;
    const adminUserId = activations[0]?.adminUserId;
    if (!activationId || !adminUserId) return null;

    await this.client.$queryRaw`
        SELECT "id"
        FROM "User"
        WHERE "id" = ${adminUserId}
        FOR UPDATE
      `;

    const lockedActivations = await this.client.$queryRaw<
      Array<{ id: string; adminUserId: string }>
    >`
        SELECT "id", "adminUserId"
        FROM "AdminActivation"
        WHERE "id" = ${activationId}
        FOR UPDATE
      `;
    if (lockedActivations.length === 0) return null;

    const [activation, current] = await Promise.all([
      this.client.adminActivation.findUnique({
        where: { id: activationId },
        select: {
          adminUserId: true,
          expiresAt: true,
          usedAt: true,
          revokedAt: true,
        },
      }),
      this.findOperatorById(adminUserId),
    ]);

    if (
      !activation ||
      !current ||
      activation.adminUserId !== current.id ||
      activation.usedAt !== null ||
      activation.revokedAt !== null ||
      activation.expiresAt <= input.now ||
      current.cpf !== input.cpf ||
      current.email !== input.email ||
      !current.isActive ||
      current.passwordHash !== null
    ) {
      return null;
    }

    const before = current;
    await this.client.user.update({
      where: { id: current.id },
      data: {
        passwordHash: input.passwordHash,
        passwordChangedAt: input.now,
        passwordResetRequired: false,
        passwordResetExpiresAt: null,
      },
    });
    await this.client.adminActivation.update({
      where: { id: activationId },
      data: { usedAt: input.now },
    });

    const after = await this.findOperatorById(current.id);
    if (!after) return null;
    return { before, after };
  }

  private transactional(tx: Prisma.TransactionClient) {
    const repository = Object.create(
      AdminOperatorsRepository.prototype,
    ) as AdminOperatorsRepository;
    repository.client = tx;
    Object.assign(repository, {
      prisma: this.prisma,
      auditRepository: this.auditRepository,
      auditWriter: this.auditRepository?.bindTransaction(tx),
    });
    return repository;
  }
}

export function buildOperatorWhere(
  filter: Pick<AdminOperatorPageFilter, 'search' | 'adminProfile' | 'state'>,
): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = { role: UserRole.ADMIN };
  if (filter.adminProfile) where.adminProfile = filter.adminProfile;
  if (filter.state === 'PENDING_ACTIVATION') {
    where.isActive = true;
    where.passwordHash = null;
  } else if (filter.state === 'ACTIVE') {
    where.isActive = true;
    where.passwordHash = { not: null };
  } else if (filter.state === 'INACTIVE') {
    where.isActive = false;
  }

  const search = filter.search?.trim();
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { cpf: { contains: search } },
    ];
  }
  return where;
}

function toOperatorRecord(row: {
  id: string;
  name: string;
  cpf: string;
  email: string;
  role: UserRole;
  adminProfile: AdminProfile | null;
  isActive: boolean;
  passwordHash: string | null;
  passwordChangedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  adminActivations?: Array<{ expiresAt: Date }>;
}): AdminOperatorRecord {
  if (row.role !== UserRole.ADMIN || row.adminProfile === null) {
    throw new Error('Invalid administrative operator record.');
  }
  return {
    id: row.id,
    name: row.name,
    cpf: row.cpf,
    email: row.email,
    role: row.role,
    adminProfile: row.adminProfile,
    isActive: row.isActive,
    passwordHash: row.passwordHash,
    passwordChangedAt: row.passwordChangedAt,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    activationExpiresAt: row.adminActivations?.[0]?.expiresAt ?? null,
  };
}

function isUniqueConstraintError(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
