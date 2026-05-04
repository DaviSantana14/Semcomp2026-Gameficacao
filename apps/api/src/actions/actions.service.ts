import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateActionDto } from './dto/create-action.dto';

const actionSummarySelect = {
  id: true,
  name: true,
  description: true,
  type: true,
  points: true,
  isActive: true,
  createdAt: true,
} as const;

@Injectable()
export class ActionsService {
  constructor(private readonly prisma: PrismaService) {}

  create(createActionDto: CreateActionDto) {
    return this.prisma.action.create({
      data: {
        name: createActionDto.name,
        description: createActionDto.description,
        type: createActionDto.type,
        points: createActionDto.points,
        isActive: createActionDto.isActive,
      },
      select: actionSummarySelect,
    });
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
}
