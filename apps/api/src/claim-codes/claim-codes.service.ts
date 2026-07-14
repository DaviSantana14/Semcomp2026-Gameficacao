import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { paginate } from '../common/dto/pagination-response.dto';
import { generateClaimCode } from '../common/event-code';
import { ClaimCodesRepository } from './claim-codes.repository';
import { ClaimCodesQueryDto } from './dto/claim-codes-query.dto';
import { ClaimCodeStatus } from './dto/claim-code-history-response.dto';
import { UpdateClaimCodeStatusDto } from './dto/update-claim-code-status.dto';

const MAX_GENERATION_ROUNDS = 5;
const MAX_GENERATION_ATTEMPTS_PER_CODE = 10;

@Injectable()
export class ClaimCodesService {
  constructor(private readonly repository: ClaimCodesRepository) {}

  async generateBatch(actionId: string, quantity: number) {
    const action = await this.repository.findActionForCodeBatch(actionId);
    if (!action) {
      throw new NotFoundException('Atividade pontuável não encontrada.');
    }
    return this.repository.withTransaction(async (repository) => {
      const insertedCodes: string[] = [];
      for (
        let round = 0;
        round < MAX_GENERATION_ROUNDS && insertedCodes.length < quantity;
        round += 1
      ) {
        const remaining = quantity - insertedCodes.length;
        const candidates = new Set<string>();
        const maxAttempts = remaining * MAX_GENERATION_ATTEMPTS_PER_CODE;
        for (
          let attempt = 0;
          attempt < maxAttempts && candidates.size < remaining;
          attempt += 1
        ) {
          candidates.add(generateClaimCode());
        }
        const inserted = await repository.insertClaimCodes(actionId, [
          ...candidates,
        ]);
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
    });
  }

  async findAll(query: ClaimCodesQueryDto) {
    const page = await this.repository.findClaimCodePage({
      page: query.page,
      limit: query.limit,
      search: query.search?.trim().toUpperCase(),
      actionId: query.actionId,
      state: query.status === 'all' ? undefined : query.status,
    });
    return paginate(
      page.rows.map((row) => this.toHistory(row)),
      page.total,
      query.page,
      query.limit,
    );
  }

  async updateStatus(id: string, dto: UpdateClaimCodeStatusDto) {
    const updated = await this.repository.updateClaimCodeStatus(
      id,
      dto.isActive,
    );
    const row = await this.repository.findClaimCodeById(id);
    if (!row) {
      throw new NotFoundException('Código de uso único não encontrado.');
    }
    if (updated.count === 0 || row.isUsed) {
      throw new ConflictException('Código de uso único já utilizado.');
    }
    return this.toHistory(row);
  }

  private toHistory(
    row: Awaited<ReturnType<ClaimCodesRepository['findClaimCodeById']>> & {},
  ) {
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
