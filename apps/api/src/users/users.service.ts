import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const userSummarySelect = {
  id: true,
  name: true,
  cpf: true,
  email: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
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

  findByCpfOrEmail(cpf: string, email: string) {
    return this.prisma.user.findFirst({
      where: {
        OR: [{ cpf }, { email }],
      },
    });
  }

  create(data: Pick<User, 'name' | 'cpf' | 'email'>) {
    return this.prisma.user.create({
      data,
    });
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
