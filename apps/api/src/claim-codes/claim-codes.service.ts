import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AuditActorType,
  AuditEntityType,
  AuditOperation,
} from '../audit/audit.repository';
import {
  AuditService,
  CLAIM_CODE_REDEMPTION_METHOD,
} from '../audit/audit.service';
import { AdminOperationContext } from '../common/request-context';
import { maskClaimCode } from '../common/claim-code-mask';
import { paginate } from '../common/dto/pagination-response.dto';
import { generateClaimCode } from '../common/event-code';
import {
  ClaimCodeBatchRecordWithCounts,
  ClaimCodesRepository,
} from './claim-codes.repository';
import { ClaimCodeBatchSummary } from './dto/claim-code-batch-response.dto';
import { ClaimCodeBatchesQueryDto } from './dto/claim-code-batches-query.dto';
import { ClaimCodesQueryDto } from './dto/claim-codes-query.dto';
import { ClaimCodeStatus } from './dto/claim-code-history-response.dto';
import { UpdateClaimCodeStatusDto } from './dto/update-claim-code-status.dto';
import { GenerateClaimCodesDto } from './dto/generate-claim-codes.dto';

const MAX_GENERATION_ROUNDS = 5;
const MAX_GENERATION_ATTEMPTS_PER_CODE = 10;

@Injectable()
export class ClaimCodesService {
  constructor(
    private readonly repository: ClaimCodesRepository,
    private readonly audit: AuditService,
  ) {}

  async generateBatch(
    actionId: string,
    dto: GenerateClaimCodesDto,
    context: AdminOperationContext,
  ) {
    const { quantity } = dto;
    return this.repository.withTransaction(async (repository) => {
      const action = await repository.findActionForCodeBatch(actionId);
      if (!action) {
        throw new NotFoundException('Atividade pontuável não encontrada.');
      }
      // The batch FK is immediate in PostgreSQL, so create the batch first
      // inside this transaction; any incomplete generation rolls both writes back.
      const batchId = randomUUID();
      const createdBatch = await repository.createBatch({
        id: batchId,
        actionId: action.id,
        createdByAdminId: context.actorAdminId,
        requestedQuantity: quantity,
        createdQuantity: quantity,
        reason: dto.reason,
        requestId: context.requestId,
      });
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
        const inserted = await repository.insertClaimCodes(actionId, batchId, [
          ...candidates,
        ]);
        insertedCodes.push(...inserted.map(({ code }) => code));
      }
      if (insertedCodes.length < quantity) {
        throw new ServiceUnavailableException(
          'Não foi possível gerar o lote completo de códigos.',
        );
      }
      await this.audit.record(repository.auditWriter!, {
        actor: { actorType: AuditActorType.ADMIN, ...context },
        operation: AuditOperation.CLAIM_CODE_BATCH_GENERATED,
        entityType: AuditEntityType.CLAIM_CODE_BATCH,
        entityId: batchId,
        reason: dto.reason,
        after: {
          requestedQuantity: quantity,
          createdQuantity: insertedCodes.length,
          redemptionMethod: CLAIM_CODE_REDEMPTION_METHOD,
          actionId: action.id,
        },
      });
      const batch = this.toBatchSummary({
        ...createdBatch,
        createdQuantity: insertedCodes.length,
        counts: action.isActive
          ? {
              available: insertedCodes.length,
              disabled: 0,
              used: 0,
              blocked: 0,
            }
          : {
              available: 0,
              disabled: 0,
              used: 0,
              blocked: insertedCodes.length,
            },
      });
      return {
        batch,
        action: { id: action.id, name: action.name },
        quantity: insertedCodes.length,
        codes: insertedCodes.sort(),
      };
    });
  }

  async findBatches(query: ClaimCodeBatchesQueryDto) {
    const from = this.parseDate(query.from, 'from');
    const to = this.parseDate(query.to, 'to');
    if (from && to && from > to) {
      throw new BadRequestException('O intervalo de datas é inválido.');
    }

    const page = await this.repository.findBatches({
      page: query.page,
      limit: query.limit,
      actionId: query.actionId,
      actorAdminId: query.actorAdminId,
      from,
      to,
    });
    return paginate(
      page.rows.map((row) => this.toBatchSummary(row)),
      page.total,
      query.page,
      query.limit,
    );
  }

  async findBatch(id: string) {
    const batch = await this.repository.findBatch(id);
    if (!batch) {
      throw new NotFoundException('Lote de códigos não encontrado.');
    }
    return this.toBatchSummary(batch);
  }

  async getBatchCodes(id: string) {
    const codes = await this.repository.getBatchCodes(id);
    if (!codes) {
      throw new NotFoundException('Lote de códigos não encontrado.');
    }
    return codes;
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

  async updateStatus(
    id: string,
    dto: UpdateClaimCodeStatusDto,
    context: AdminOperationContext,
  ) {
    return this.repository.withTransaction(async (repository) => {
      const current = await repository.findClaimCodeById(id);
      if (!current) {
        throw new NotFoundException('Código de uso único não encontrado.');
      }
      if (current.isUsed) {
        throw new ConflictException('Código de uso único já utilizado.');
      }
      if (current.isActive === dto.isActive) return this.toHistory(current);

      const updated = await repository.updateClaimCodeStatus(
        id,
        dto.isActive,
        current.isActive,
      );
      const row = await repository.findClaimCodeById(id);
      if (!row) {
        throw new NotFoundException('Código de uso único não encontrado.');
      }
      if (row.isUsed) {
        throw new ConflictException('Código de uso único já utilizado.');
      }
      if (updated.count === 0) {
        if (row.isActive === dto.isActive) return this.toHistory(row);
        throw new ConflictException(
          'Código de uso único teve o status alterado concorrentemente.',
        );
      }
      const maskedCode = maskClaimCode(current.code);
      await this.audit.record(repository.auditWriter!, {
        actor: { actorType: AuditActorType.ADMIN, ...context },
        operation: AuditOperation.CLAIM_CODE_STATUS_CHANGED,
        entityType: AuditEntityType.CLAIM_CODE,
        entityId: id,
        reason: dto.reason,
        before: {
          id,
          isActive: current.isActive,
          isUsed: current.isUsed,
          maskedCode,
        },
        after: {
          id,
          isActive: row.isActive,
          isUsed: row.isUsed,
          maskedCode,
        },
      });
      return this.toHistory(row);
    });
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

  private toBatchSummary(
    row: ClaimCodeBatchRecordWithCounts & {
      createdQuantity: number;
    },
  ): ClaimCodeBatchSummary {
    return {
      id: row.id,
      action: { id: row.action.id, name: row.action.name },
      createdBy: {
        id: row.createdByAdmin.id,
        name: row.createdByAdmin.name,
        email: row.createdByAdmin.email,
      },
      requestedQuantity: row.requestedQuantity,
      createdQuantity: row.createdQuantity,
      reason: row.reason,
      requestId: row.requestId,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : row.createdAt,
      counts: row.counts,
    };
  }

  private parseDate(value: string | undefined, field: 'from' | 'to') {
    if (value === undefined) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(
        `O campo ${field} contém uma data inválida.`,
      );
    }
    return date;
  }
}
