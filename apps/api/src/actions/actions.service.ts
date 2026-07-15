import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PersistenceUniqueConstraintError } from '../common/persistence-errors';
import { paginate } from '../common/dto/pagination-response.dto';
import { isClaimCode, normalizeEventCode } from '../common/event-code';
import {
  ActionSummary,
  ActionsRepository,
  ActionUpdateInput,
} from './actions.repository';
import { CreateActionDto } from './dto/create-action.dto';
import {
  ActionStatusFilter,
  AdminActionsQueryDto,
} from './dto/admin-actions-query.dto';
import { ReusableCodeStatus } from './dto/reusable-code-history-response.dto';
import {
  ReusableCodeRedemptionsQueryDto,
  ReusableCodesQueryDto,
} from './dto/reusable-codes-query.dto';
import { UpdateActionDto } from './dto/update-action.dto';
import {
  AuditActorType,
  AuditEntityType,
  AuditOperation,
} from '../audit/audit.repository';
import { AuditService } from '../audit/audit.service';
import { AdminOperationContext } from '../common/request-context';

@Injectable()
export class ActionsService {
  constructor(
    private readonly repository: ActionsRepository,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateActionDto, context: AdminOperationContext) {
    const code = normalizeEventCode(dto.code);
    this.assertReusableCode(code);
    try {
      return await this.repository.withTransaction(async (repository) => {
        const action = await repository.createAction({
          name: dto.name,
          description: dto.description,
          type: dto.type,
          code,
          points: dto.points,
          isActive: dto.isActive,
          isCodeActive: Boolean(code),
        });
        await this.audit.record(repository.auditWriter!, {
          actor: { actorType: AuditActorType.ADMIN, ...context },
          operation: AuditOperation.ACTION_CREATED,
          entityType: AuditEntityType.ACTION,
          entityId: action.id,
          reason: dto.reason,
          before: null,
          after: toActionAuditSnapshot(action),
        });
        return action;
      });
    } catch (error) {
      this.rethrowActionCodeConflict(error);
    }
  }

  findAll() {
    return this.repository.findActions();
  }

  findById(id: string) {
    return this.repository.findActionById(id);
  }

  async update(
    id: string,
    dto: UpdateActionDto,
    context: AdminOperationContext,
  ) {
    try {
      return await this.repository.withTransaction(async (repository) => {
        const current = await repository.findActionById(id);
        if (!current) {
          throw new NotFoundException('Atividade pontuável não encontrada.');
        }
        const input = this.buildActionUpdate(dto, current);
        const effectiveInput = Object.fromEntries(
          Object.entries(input).filter(
            ([field, value]) => current[field as keyof ActionSummary] !== value,
          ),
        ) as ActionUpdateInput;
        const changedFields = Object.keys(effectiveInput);
        if (changedFields.length === 0) return current;

        const updated = await repository.updateAction(id, effectiveInput);
        if (changedFields.length === 1 && changedFields[0] === 'isActive') {
          await this.audit.record(repository.auditWriter!, {
            actor: { actorType: AuditActorType.ADMIN, ...context },
            operation: AuditOperation.ACTION_STATUS_CHANGED,
            entityType: AuditEntityType.ACTION,
            entityId: id,
            reason: dto.reason,
            before: { isActive: current.isActive },
            after: { isActive: updated.isActive },
          });
        } else {
          await this.audit.record(repository.auditWriter!, {
            actor: { actorType: AuditActorType.ADMIN, ...context },
            operation: AuditOperation.ACTION_UPDATED,
            entityType: AuditEntityType.ACTION,
            entityId: id,
            reason: dto.reason,
            before: toActionAuditSnapshot(current),
            after: toActionAuditSnapshot(updated),
          });
        }
        return updated;
      });
    } catch (error) {
      this.rethrowActionCodeConflict(error);
    }
  }

  private buildActionUpdate(dto: UpdateActionDto, current: ActionSummary) {
    const input: ActionUpdateInput = {};
    for (const field of [
      'name',
      'description',
      'type',
      'points',
      'isActive',
    ] as const) {
      if (dto[field] !== undefined) {
        Object.assign(input, { [field]: dto[field] });
      }
    }
    if (dto.code !== undefined) {
      const code =
        dto.code === null ? null : (normalizeEventCode(dto.code) ?? null);
      this.assertReusableCode(code);
      input.code = code;
      input.isCodeActive = code
        ? (dto.isCodeActive ?? (current.code ? current.isCodeActive : true))
        : false;
    } else if (dto.isCodeActive !== undefined) {
      input.isCodeActive = current.code ? dto.isCodeActive : false;
    }
    return input;
  }

  async findAdminActions(query: AdminActionsQueryDto) {
    const page = await this.repository.findAdminActionPage({
      page: query.page,
      limit: query.limit,
      search: query.search?.trim(),
      isActive:
        query.status === undefined
          ? undefined
          : query.status === ActionStatusFilter.ACTIVE,
      type: query.type,
    });
    const counters = await this.repository.findActionCounters(
      page.rows.map((row) => row.id),
    );
    const redemptionMap = new Map(
      counters.redemptionCounts.map((row) => [row.actionId, row._count._all]),
    );
    return paginate(
      page.rows.map((row) => ({
        ...row,
        claimCodes: {
          total: counters.claimCounts
            .filter((count) => count.actionId === row.id)
            .reduce((sum, count) => sum + count._count._all, 0),
          used: counters.claimCounts
            .filter((count) => count.actionId === row.id && count.isUsed)
            .reduce((sum, count) => sum + count._count._all, 0),
          available: row.isActive
            ? counters.claimCounts
                .filter(
                  (count) =>
                    count.actionId === row.id &&
                    !count.isUsed &&
                    count.isActive,
                )
                .reduce((sum, count) => sum + count._count._all, 0)
            : 0,
        },
        redemptionsCount: redemptionMap.get(row.id) ?? 0,
      })),
      page.total,
      query.page,
      query.limit,
    );
  }

  async findReusableCodes(query: ReusableCodesQueryDto) {
    const page = await this.repository.findReusableCodePage({
      page: query.page,
      limit: query.limit,
      search: query.search?.trim(),
      actionId: query.actionId,
      state: query.status === 'all' ? undefined : query.status,
    });
    const uses = await this.repository.findReusableCodeUses(
      page.rows.map((row) => row.id),
    );
    const useMap = new Map(uses.map((row) => [row.actionId, row] as const));
    return paginate(
      page.rows.map((row) => {
        const use = useMap.get(row.id);
        return {
          id: row.id,
          name: row.name,
          type: row.type,
          code: row.code!,
          points: row.points,
          status: !row.isCodeActive
            ? ReusableCodeStatus.DISABLED
            : row.isActive
              ? ReusableCodeStatus.ACTIVE
              : ReusableCodeStatus.BLOCKED_BY_ACTION,
          isCodeActive: row.isCodeActive,
          totalUses: use?._count._all ?? 0,
          lastUsedAt: use?._max.createdAt?.toISOString() ?? null,
        };
      }),
      page.total,
      query.page,
      query.limit,
    );
  }

  async findReusableCodeRedemptions(
    actionId: string,
    query: ReusableCodeRedemptionsQueryDto,
  ) {
    if (!(await this.repository.findActionById(actionId))) {
      throw new NotFoundException('Atividade pontuável não encontrada.');
    }
    const page = await this.repository.findReusableCodeRedemptionPage(
      actionId,
      query.page,
      query.limit,
    );
    return paginate(
      page.rows.map((row) => ({
        id: row.id,
        points: row.points,
        createdAt: row.createdAt.toISOString(),
        participant: row.user,
      })),
      page.total,
      query.page,
      query.limit,
    );
  }

  async redeemByCode(code: string, userId: string) {
    const normalized = normalizeEventCode(code);
    if (!normalized) {
      throw new NotFoundException('Atividade pontuável não encontrada.');
    }
    if (isClaimCode(normalized)) {
      return this.redeemClaimCode(normalized, userId);
    }
    const action = await this.repository.findActionIdByCode(normalized);
    if (!action) {
      throw new NotFoundException('Atividade pontuável não encontrada.');
    }
    return this.redeemAction(action.id, userId, 'REUSABLE_CODE');
  }

  redeem(actionId: string, userId: string) {
    return this.redeemAction(actionId, userId, 'DIRECT');
  }

  private async redeemAction(
    actionId: string,
    userId: string,
    method: 'DIRECT' | 'REUSABLE_CODE',
  ) {
    try {
      return await this.repository.withTransaction(async (repository) => {
        const action = await repository.findActionById(actionId);
        if (!action) {
          throw new NotFoundException('Atividade pontuável não encontrada.');
        }
        if (method === 'REUSABLE_CODE' && !action.isCodeActive) {
          throw new BadRequestException('Este código está inativo.');
        }
        return this.grantAction(repository, action, userId, method);
      });
    } catch (error) {
      this.rethrowRedemptionConflict(error);
    }
  }

  private async redeemClaimCode(code: string, userId: string) {
    try {
      return await this.repository.withTransaction(async (repository) => {
        const claimCode = await repository.findClaimCodeForRedemption(code);
        if (!claimCode) {
          throw new NotFoundException('Atividade pontuável não encontrada.');
        }
        if (claimCode.isUsed) {
          throw new ConflictException('Este código já foi utilizado.');
        }
        if (!claimCode.isActive) {
          throw new BadRequestException('Este código está inativo.');
        }
        if (!claimCode.action.isActive) {
          throw new BadRequestException(
            'Esta atividade está inativa e não pode ser resgatada.',
          );
        }
        const usedAt = new Date();
        const consumed = await repository.consumeClaimCode(
          claimCode.id,
          userId,
          usedAt,
        );
        if (consumed.count !== 1) {
          const current = await repository.findClaimCodeState(claimCode.id);
          if (current?.isUsed) {
            throw new ConflictException('Este código já foi utilizado.');
          }
          if (current && !current.isActive) {
            throw new BadRequestException('Este código está inativo.');
          }
          throw new ConflictException('Não foi possível consumir este código.');
        }
        return this.grantAction(
          repository,
          claimCode.action,
          userId,
          'CLAIM_CODE',
          claimCode.id,
        );
      });
    } catch (error) {
      this.rethrowRedemptionConflict(error);
    }
  }

  private async grantAction(
    repository: ActionsRepository,
    action: ActionSummary,
    userId: string,
    redemptionMethod: 'DIRECT' | 'REUSABLE_CODE' | 'CLAIM_CODE',
    claimCodeId?: string,
  ) {
    if (!action.isActive) {
      throw new BadRequestException(
        'Esta atividade está inativa e não pode ser resgatada.',
      );
    }
    const redeemedAt = new Date();
    const xpDelta = action.points;
    await repository.createActionPointEvent({
      userId,
      actionId: action.id,
      points: action.points,
      xpDelta,
      redemptionMethod,
      claimCodeId,
      description: `Resgate da atividade: ${action.name}`,
      createdAt: redeemedAt,
    });
    const user = await repository.incrementUserProgress(
      userId,
      action.points,
      xpDelta,
    );
    return {
      action,
      awardedPoints: action.points,
      currentPoints: user.points,
      currentXp: user.xp,
      currentLevel: user.level,
      redeemedAt,
    };
  }

  private assertReusableCode(code: string | null | undefined) {
    if (isClaimCode(code)) {
      throw new BadRequestException(
        'Este formato é reservado para códigos de uso único.',
      );
    }
  }

  private rethrowActionCodeConflict(error: unknown): never {
    if (error instanceof PersistenceUniqueConstraintError) {
      throw new ConflictException(
        'Já existe uma atividade pontuável com este código.',
      );
    }
    throw error;
  }

  private rethrowRedemptionConflict(error: unknown): never {
    if (error instanceof PersistenceUniqueConstraintError) {
      throw new ConflictException('Você já resgatou esta atividade.');
    }
    throw error;
  }
}

function toActionAuditSnapshot(action: ActionSummary) {
  return {
    id: action.id,
    name: action.name,
    description: action.description,
    type: action.type,
    points: action.points,
    isActive: action.isActive,
    isCodeActive: action.isCodeActive,
  };
}
