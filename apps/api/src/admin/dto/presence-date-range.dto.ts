import { BadRequestException } from '@nestjs/common';
import { Matches } from 'class-validator';
import {
  addUtcMonths,
  operationalDateUtc,
} from '../../common/operational-time';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class PresenceDateRangeDto {
  @Matches(DATE_ONLY_PATTERN, {
    message: 'from deve estar no formato YYYY-MM-DD.',
  })
  from!: string;

  @Matches(DATE_ONLY_PATTERN, {
    message: 'to deve estar no formato YYYY-MM-DD.',
  })
  to!: string;
}

export type PresenceDateRange = {
  from: Date;
  to: Date;
};

export function parsePresenceRange(
  query: Pick<PresenceDateRangeDto, 'from' | 'to'>,
  now = new Date(),
): PresenceDateRange {
  const from = parseDateOnly(query.from, 'from');
  const to = parseDateOnly(query.to, 'to');

  if (from.getTime() >= to.getTime()) {
    throw new BadRequestException(
      'O início do período deve ser anterior ao fim do período.',
    );
  }

  const retentionCutoff = addUtcMonths(operationalDateUtc(now), -24);
  if (from.getTime() < retentionCutoff.getTime()) {
    throw new BadRequestException(
      'O período solicitado está fora da retenção disponível.',
    );
  }

  const maximumEnd = addUtcMonths(from, 24);
  if (to.getTime() > maximumEnd.getTime()) {
    throw new BadRequestException(
      'O período solicitado não pode ultrapassar 24 meses.',
    );
  }

  return { from, to };
}

export function formatPresenceDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateOnly(value: unknown, field: 'from' | 'to'): Date {
  if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) {
    throw new BadRequestException(`${field} deve estar no formato YYYY-MM-DD.`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException(`${field} não representa uma data válida.`);
  }

  return date;
}
