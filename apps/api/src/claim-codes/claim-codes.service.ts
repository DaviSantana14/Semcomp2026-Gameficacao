import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginate } from '../common/dto/pagination-response.dto';
import { generateClaimCode } from '../common/event-code';
import { PrismaService } from '../prisma/prisma.service';
import { ClaimCodesQueryDto } from './dto/claim-codes-query.dto';
import { ClaimCodeStatus } from './dto/claim-code-history-response.dto';
import { UpdateClaimCodeStatusDto } from './dto/update-claim-code-status.dto';

const MAX_GENERATION_ROUNDS = 5;
const MAX_GENERATION_ATTEMPTS_PER_CODE = 10;
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
type ClaimCodeHistoryRow = Prisma.ClaimCodeGetPayload<{
  select: typeof claimCodeHistorySelect;
}>;

@Injectable()
export class ClaimCodesService {
  constructor(private readonly prisma: PrismaService) {}

  async generateBatch(actionId: string, quantity: number) {
    const action = await this.prisma.action.findUnique({
      where: { id: actionId },
      select: { id: true, name: true },
    });

    if (!action) {
      throw new NotFoundException('Atividade pontuável não encontrada.');
    }

    const insertedCodes: string[] = [];

    for (
      let round = 0;
      round < MAX_GENERATION_ROUNDS && insertedCodes.length < quantity;
      round += 1
    ) {
      const remaining = quantity - insertedCodes.length;
      const candidates = new Set<string>();
      const maxGenerationAttempts =
        remaining * MAX_GENERATION_ATTEMPTS_PER_CODE;

      for (
        let attempt = 0;
        attempt < maxGenerationAttempts && candidates.size < remaining;
        attempt += 1
      ) {
        candidates.add(generateClaimCode());
      }

      const inserted = await this.prisma.claimCode.createManyAndReturn({
        data: [...candidates].map((code) => ({
          code,
          actionId,
          isActive: true,
        })),
        skipDuplicates: true,
        select: { code: true },
      });

      insertedCodes.push(...inserted.map(({ code }) => code));
    }

    if (insertedCodes.length < quantity) {
      throw new ServiceUnavailableException(
        'Não foi possível gerar o lote completo de códigos.',
      );
    }

    return {
      action,
      quantity: insertedCodes.length,
      codes: insertedCodes.sort(),
    };
  }

  async findAll(query: ClaimCodesQueryDto) {
    const search = query.search?.trim().toUpperCase();
    const where: Prisma.ClaimCodeWhereInput = {};
    if (query.actionId) where.actionId = query.actionId;
    if (search) where.code = { contains: search };
    if (query.status === 'available')
      Object.assign(where, {
        isUsed: false,
        isActive: true,
        action: { isActive: true },
      });
    if (query.status === 'disabled')
      Object.assign(where, { isUsed: false, isActive: false });
    if (query.status === 'blocked')
      Object.assign(where, {
        isUsed: false,
        isActive: true,
        action: { isActive: false },
      });
    if (query.status === 'used') Object.assign(where, { isUsed: true });
    const [total, rows] = await Promise.all([
      this.prisma.claimCode.count({ where }),
      this.prisma.claimCode.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: claimCodeHistorySelect,
      }),
    ]);
    return paginate(
      rows.map((row) => this.toHistory(row)),
      total,
      query.page,
      query.limit,
    );
  }

  async updateStatus(id: string, dto: UpdateClaimCodeStatusDto) {
    const updated = await this.prisma.claimCode.updateMany({
      where: { id, isUsed: false },
      data: { isActive: dto.isActive },
    });
    const row = await this.prisma.claimCode.findUnique({
      where: { id },
      select: claimCodeHistorySelect,
    });
    if (!row)
      throw new NotFoundException('Código de uso único não encontrado.');
    if (updated.count === 0 || row.isUsed)
      throw new ConflictException('Código de uso único já utilizado.');
    return this.toHistory(row);
  }

  private toHistory(row: ClaimCodeHistoryRow) {
    const status = row.isUsed
      ? ClaimCodeStatus.USED
      : !row.isActive
        ? ClaimCodeStatus.DISABLED
        : !row.action.isActive
          ? ClaimCodeStatus.BLOCKED_BY_ACTION
          : ClaimCodeStatus.AVAILABLE;
    return {
      id: row.id,
      code: row.code,
      isActive: row.isActive,
      isUsed: row.isUsed,
      usedBy: row.usedBy,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : row.createdAt,
      usedAt:
        row.usedAt instanceof Date ? row.usedAt.toISOString() : row.usedAt,
      action: { id: row.action.id, name: row.action.name },
      status,
    };
  }
}
