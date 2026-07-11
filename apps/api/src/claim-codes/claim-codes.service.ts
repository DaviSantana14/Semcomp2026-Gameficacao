import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { generateClaimCode } from '../common/event-code';
import { PrismaService } from '../prisma/prisma.service';

const MAX_GENERATION_ROUNDS = 5;

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

      while (candidates.size < remaining) {
        candidates.add(generateClaimCode());
      }

      const inserted = await this.prisma.claimCode.createManyAndReturn({
        data: [...candidates].map((code) => ({ code, actionId })),
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
}
