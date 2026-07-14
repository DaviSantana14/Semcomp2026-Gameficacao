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
  createdAt: true,
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

  findByCpfOrEmail(cpf: string, email: string) {
    return this.prisma.user.findFirst({
      where: {
        OR: [{ cpf }, { email }],
      },
    });
  }

  async create(data: { name: string; cpf: string; email: string }) {
    try {
      return await this.prisma.user.create({ data });
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

  findActiveByCredentials(cpf: string, email: string) {
    return this.prisma.user.findFirst({
      where: {
        cpf,
        email,
        isActive: true,
      },
    });
  }

  updateLastLoginAt(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
      select: userSummarySelect,
    });
  }
}
