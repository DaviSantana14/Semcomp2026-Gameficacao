import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PointEventKind, PointEventSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateActionDto } from './dto/create-action.dto';
import { isClaimCode, normalizeEventCode } from '../common/event-code';

const actionSummarySelect = {
  id: true,
  name: true,
  description: true,
  type: true,
  code: true,
  points: true,
  isActive: true,
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

    return this.redeem(action.id, userId);
  }

  async redeem(actionId: string, userId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const action = await tx.action.findUnique({
          where: { id: actionId },
          select: actionSummarySelect,
        });

        if (!action) {
          throw new NotFoundException('Atividade pontuável não encontrada.');
        }

        return this.grantAction(tx, action, userId);
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

        if (!claimCode.action.isActive) {
          throw new BadRequestException(
            'Esta atividade está inativa e não pode ser resgatada.',
          );
        }

        const usedAt = new Date();
        const consumed = await tx.claimCode.updateMany({
          where: { id: claimCode.id, isUsed: false },
          data: { isUsed: true, usedById: userId, usedAt },
        });

        if (consumed.count !== 1) {
          throw new ConflictException('Este código já foi utilizado.');
        }

        return this.grantAction(tx, claimCode.action, userId);
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
