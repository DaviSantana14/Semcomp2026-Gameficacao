import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PersistenceUniqueConstraintError } from '../common/persistence-errors';
import { PrismaService } from '../prisma/prisma.service';

const userSummarySelect = {
  id: true,
  name: true,
  cpf: true,
  email: true,
  role: true,
  points: true,
  xp: true,
  level: true,
  isActive: true,
  lastLoginAt: true,
  adminProfile: true,
  passwordResetRequired: true,
  passwordResetExpiresAt: true,
  createdAt: true,
} as const;

const adminAuthenticationSelect = {
  ...userSummarySelect,
  passwordHash: true,
} as const;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({
      select: userSummarySelect,
      orderBy: { createdAt: 'asc' },
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: userSummarySelect,
    });
  }

  findActiveSummaryById(id: string) {
    return this.prisma.user.findFirst({
      where: {
        id,
        isActive: true,
      },
      select: userSummarySelect,
    });
  }

  async create(data: { name: string; cpf: string; email: string }) {
    try {
      return await this.prisma.user.create({
        data,
        select: userSummarySelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new PersistenceUniqueConstraintError({ cause: error });
      }
      throw error;
    }
  }

  findByEmailForAuthentication(email: string) {
    return this.prisma.user.findFirst({
      where: { email },
      select: {
        id: true,
        role: true,
        isActive: true,
        passwordHash: true,
        adminProfile: true,
        passwordResetRequired: true,
        passwordResetExpiresAt: true,
      },
    });
  }

  findByCredentialsWithPasswordHash(cpf: string, email: string) {
    return this.prisma.user.findFirst({
      where: { cpf, email },
      select: adminAuthenticationSelect,
    });
  }

  async setAdminPassword(cpf: string, email: string, passwordHash: string) {
    return this.prisma.$transaction(async (tx) => {
      const admins = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "User"
        WHERE "cpf" = ${cpf}
          AND "email" = ${email}
          AND "role" = 'ADMIN'::"UserRole"
          AND "adminProfile" = 'GENERAL'::"AdminProfile"
        FOR UPDATE
      `);
      const admin = admins[0];

      if (!admin) {
        return false;
      }

      const now = new Date();
      await tx.user.update({
        where: { id: admin.id },
        data: {
          passwordHash,
          passwordChangedAt: now,
          isActive: true,
          passwordResetRequired: false,
          passwordResetExpiresAt: null,
        },
      });

      await tx.userSession.updateMany({
        where: {
          userId: admin.id,
          endedAt: null,
          expiresAt: { gt: now },
        },
        data: { endedAt: now, endReason: 'REVOKED' },
      });

      return true;
    });
  }
}
