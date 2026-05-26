import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PointEventKind, PointEventSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateActionDto } from './dto/create-action.dto';

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
    try {
      return await this.prisma.action.create({
        data: {
          name: createActionDto.name,
          description: createActionDto.description,
          type: createActionDto.type,
          code: normalizeActionCode(createActionDto.code),
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
        throw new ConflictException('Já existe uma action com este código.');
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

  async redeem(actionId: string, userId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const action = await tx.action.findUnique({
          where: { id: actionId },
          select: actionSummarySelect,
        });

        if (!action) {
          throw new NotFoundException('Action não encontrada.');
        }

        if (!action.isActive) {
          throw new BadRequestException(
            'Esta action está inativa e não pode ser resgatada.',
          );
        }

        const redeemedAt = new Date();

        await tx.pointEvent.create({
          data: {
            userId,
            actionId,
            points: action.points,
            kind: PointEventKind.CREDIT,
            source: PointEventSource.ACTION_REDEEM,
            description: `Resgate da action: ${action.name}`,
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
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Você já resgatou esta action.');
      }

      throw error;
    }
  }
}

function normalizeActionCode(code: string | null | undefined) {
  if (code == null) {
    return undefined;
  }

  const normalized = code.trim().toUpperCase();

  return normalized.length > 0 ? normalized : undefined;
}
