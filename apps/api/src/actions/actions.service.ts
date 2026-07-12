import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PointEventKind, PointEventSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateActionDto } from './dto/create-action.dto';
import {
  AdminActionsQueryDto,
  ActionStatusFilter,
} from './dto/admin-actions-query.dto';
import {
  ReusableCodeRedemptionsQueryDto,
  ReusableCodesQueryDto,
} from './dto/reusable-codes-query.dto';
import { UpdateActionDto } from './dto/update-action.dto';
import { ReusableCodeStatus } from './dto/reusable-code-history-response.dto';
import { paginate } from '../common/dto/pagination-response.dto';
import { isClaimCode, normalizeEventCode } from '../common/event-code';

const actionSummarySelect = {
  id: true,
  name: true,
  description: true,
  type: true,
  code: true,
  points: true,
  isActive: true,
  isCodeActive: true,
  createdAt: true,
} as const;

const userProgressSelect = {
  id: true,
  points: true,
  xp: true,
  level: true,
} as const;

@Injectable()
export class ActionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createActionDto: CreateActionDto) {
    const normalizedCode = normalizeEventCode(createActionDto.code);

    if (isClaimCode(normalizedCode)) {
      throw new BadRequestException(
        'Este formato é reservado para códigos de uso único.',
      );
    }

    try {
      return await this.prisma.action.create({
        data: {
          name: createActionDto.name,
          description: createActionDto.description,
          type: createActionDto.type,
          code: normalizedCode,
          points: createActionDto.points,
          isActive: createActionDto.isActive,
          isCodeActive: Boolean(normalizedCode),
        },
        select: actionSummarySelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Já existe uma atividade pontuável com este código.',
        );
      }

      throw error;
    }
  }

  findAll() {
    return this.prisma.action.findMany({
      select: actionSummarySelect,
      orderBy: { createdAt: 'asc' },
    });
  }

  findById(id: string) {
    return this.prisma.action.findUnique({
      where: { id },
      select: actionSummarySelect,
    });
  }

  async update(id: string, dto: UpdateActionDto) {
    const current = await this.prisma.action.findUnique({
      where: { id },
      select: { id: true, code: true, isCodeActive: true },
    });
    if (!current)
      throw new NotFoundException('Atividade pontuável não encontrada.');

    const data: Prisma.ActionUpdateInput = {};
    for (const field of [
      'name',
      'description',
      'type',
      'points',
      'isActive',
    ] as const) {
      if (dto[field] !== undefined) data[field] = dto[field] as never;
    }
    if (dto.code !== undefined) {
      const code =
        dto.code === null ? null : (normalizeEventCode(dto.code) ?? null);
      if (code && isClaimCode(code)) {
        throw new BadRequestException(
          'Este formato é reservado para códigos de uso único.',
        );
      }
      data.code = code;
      data.isCodeActive = code
        ? (dto.isCodeActive ?? (current.code ? current.isCodeActive : true))
        : false;
    } else if (dto.isCodeActive !== undefined) {
      data.isCodeActive = current.code ? dto.isCodeActive : false;
    }

    try {
      return await this.prisma.action.update({
        where: { id },
        data,
        select: actionSummarySelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Já existe uma atividade pontuável com este código.',
        );
      }
      throw error;
    }
  }

  async findAdminActions(query: AdminActionsQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.ActionWhereInput = {};
    if (query.status)
      where.isActive = query.status === ActionStatusFilter.ACTIVE;
    if (query.type) where.type = query.type;
    if (search)
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    const [total, rows] = await Promise.all([
      this.prisma.action.count({ where }),
      this.prisma.action.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: actionSummarySelect,
      }),
    ]);
    const ids = rows.map((row) => row.id);
    const [claimCounts, redemptionCounts] = ids.length
      ? await Promise.all([
          this.prisma.claimCode.groupBy({
            by: ['actionId', 'isUsed', 'isActive'],
            where: { actionId: { in: ids } },
            _count: { _all: true },
          }),
          this.prisma.pointEvent.groupBy({
            by: ['actionId'],
            where: { actionId: { in: ids }, source: 'ACTION_REDEEM' },
            _count: { _all: true },
          }),
        ])
      : [[], []];
    const redemptionMap = new Map(
      redemptionCounts.map((row) => [row.actionId, row._count._all]),
    );
    return paginate(
      rows.map((row) => ({
        ...row,
        claimCodes: {
          total: claimCounts
            .filter((count) => count.actionId === row.id)
            .reduce((sum, count) => sum + count._count._all, 0),
          used: claimCounts
            .filter((count) => count.actionId === row.id && count.isUsed)
            .reduce((sum, count) => sum + count._count._all, 0),
          available: row.isActive
            ? claimCounts
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
      total,
      query.page,
      query.limit,
    );
  }

  async findReusableCodes(query: ReusableCodesQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.ActionWhereInput = {
      code: { not: null },
    };
    if (query.actionId) where.id = query.actionId;
    if (query.status === 'active')
      Object.assign(where, { isActive: true, isCodeActive: true });
    if (query.status === 'disabled')
      Object.assign(where, { isCodeActive: false });
    if (query.status === 'blocked')
      Object.assign(where, { isActive: false, isCodeActive: true });
    if (search)
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    const [total, rows] = await Promise.all([
      this.prisma.action.count({ where }),
      this.prisma.action.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: actionSummarySelect,
      }),
    ]);
    const ids = rows.map((row) => row.id);
    const uses = ids.length
      ? await this.prisma.pointEvent.groupBy({
          by: ['actionId'],
          where: {
            actionId: { in: ids },
            source: 'ACTION_REDEEM',
            redemptionMethod: 'REUSABLE_CODE',
          },
          _count: { _all: true },
          _max: { createdAt: true },
        })
      : [];
    const useMap = new Map(uses.map((row) => [row.actionId, row]));
    return paginate(
      rows.map((row) => {
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
      total,
      query.page,
      query.limit,
    );
  }

  async findReusableCodeRedemptions(
    actionId: string,
    query: ReusableCodeRedemptionsQueryDto,
  ) {
    const action = await this.prisma.action.findUnique({
      where: { id: actionId },
      select: { id: true },
    });
    if (!action)
      throw new NotFoundException('Atividade pontuável não encontrada.');
    const where = {
      actionId,
      source: 'ACTION_REDEEM' as const,
      redemptionMethod: 'REUSABLE_CODE' as const,
    };
    const [total, rows] = await Promise.all([
      this.prisma.pointEvent.count({ where }),
      this.prisma.pointEvent.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          points: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);
    return paginate(
      rows.map((row) => ({
        id: row.id,
        points: row.points,
        createdAt: row.createdAt.toISOString(),
        participant: row.user,
      })),
      total,
      query.page,
      query.limit,
    );
  }

  async redeemByCode(code: string, userId: string) {
    const normalizedCode = normalizeEventCode(code);

    if (!normalizedCode) {
      throw new NotFoundException('Atividade pontuável não encontrada.');
    }

    if (isClaimCode(normalizedCode)) {
      return this.redeemClaimCode(normalizedCode, userId);
    }

    const action = await this.prisma.action.findUnique({
      where: { code: normalizedCode },
      select: { id: true },
    });

    if (!action) {
      throw new NotFoundException('Atividade pontuável não encontrada.');
    }

    return this.redeemWithMethod(action.id, userId, 'REUSABLE_CODE');
  }

  async redeem(actionId: string, userId: string) {
    return this.redeemWithMethod(actionId, userId, 'DIRECT');
  }

  private async redeemWithMethod(
    actionId: string,
    userId: string,
    redemptionMethod: 'DIRECT' | 'REUSABLE_CODE',
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const action = await tx.action.findUnique({
          where: { id: actionId },
          select: actionSummarySelect,
        });

        if (!action) {
          throw new NotFoundException('Atividade pontuável não encontrada.');
        }

        if (redemptionMethod === 'REUSABLE_CODE' && !action.isCodeActive) {
          throw new BadRequestException('Este código está inativo.');
        }
        return this.grantAction(tx, action, userId, { redemptionMethod });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Você já resgatou esta atividade.');
      }

      throw error;
    }
  }

  private async redeemClaimCode(code: string, userId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const claimCode = await tx.claimCode.findUnique({
          where: { code },
          include: { action: { select: actionSummarySelect } },
        });

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
        const consumed = await tx.claimCode.updateMany({
          where: { id: claimCode.id, isUsed: false, isActive: true },
          data: { isUsed: true, isActive: false, usedById: userId, usedAt },
        });

        if (consumed.count !== 1) {
          const current = await tx.claimCode.findUnique({
            where: { id: claimCode.id },
            select: { isUsed: true, isActive: true },
          });
          if (current?.isUsed) {
            throw new ConflictException('Este código já foi utilizado.');
          }
          if (current && !current.isActive) {
            throw new BadRequestException('Este código está inativo.');
          }
          throw new ConflictException('Não foi possível consumir este código.');
        }

        return this.grantAction(tx, claimCode.action, userId, {
          redemptionMethod: 'CLAIM_CODE',
          claimCodeId: claimCode.id,
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Você já resgatou esta atividade.');
      }

      throw error;
    }
  }

  private async grantAction(
    tx: Prisma.TransactionClient,
    action: Prisma.ActionGetPayload<{ select: typeof actionSummarySelect }>,
    userId: string,
    redemption:
      | { redemptionMethod: 'DIRECT' | 'REUSABLE_CODE'; claimCodeId?: never }
      | { redemptionMethod: 'CLAIM_CODE'; claimCodeId: string },
  ) {
    if (!action.isActive) {
      throw new BadRequestException(
        'Esta atividade está inativa e não pode ser resgatada.',
      );
    }

    const redeemedAt = new Date();

    await tx.pointEvent.create({
      data: {
        userId,
        actionId: action.id,
        points: action.points,
        kind: PointEventKind.CREDIT,
        source: PointEventSource.ACTION_REDEEM,
        redemptionMethod: redemption.redemptionMethod,
        claimCodeId: redemption.claimCodeId,
        description: `Resgate da atividade: ${action.name}`,
        createdAt: redeemedAt,
      },
    });

    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        points: { increment: action.points },
        xp: { increment: action.points },
      },
      select: userProgressSelect,
    });

    return {
      action,
      awardedPoints: action.points,
      currentPoints: updatedUser.points,
      currentXp: updatedUser.xp,
      currentLevel: updatedUser.level,
      redeemedAt,
    };
  }
}
