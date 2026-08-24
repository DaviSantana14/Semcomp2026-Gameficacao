import { BadRequestException } from '@nestjs/common';
import { startOfOperationalDayUtc } from './operational-time';

export type OperationalDateRange = { from?: Date; to?: Date };

export function parseOperationalDateRange(query: {
  from?: string;
  to?: string;
}): OperationalDateRange {
  if (query.from === undefined && query.to === undefined) return {};
  if (query.from === undefined || query.to === undefined) {
    throw new BadRequestException(
      'from e to devem ser informados juntos para filtrar o período.',
    );
  }

  const from = parseOperationalDate(query.from, 'from');
  const to = parseOperationalDate(query.to, 'to');
  if (from.getTime() >= to.getTime()) {
    throw new BadRequestException(
      'O início do período deve ser anterior ao fim do período.',
    );
  }
  return { from, to };
}

function parseOperationalDate(value: string, field: 'from' | 'to') {
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException(`${field} não representa uma data válida.`);
  }
  return startOfOperationalDayUtc(parsed);
}
