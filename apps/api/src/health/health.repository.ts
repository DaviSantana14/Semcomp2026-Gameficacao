import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async checkDatabase() {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}
