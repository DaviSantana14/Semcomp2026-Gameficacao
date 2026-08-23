import { Injectable } from '@nestjs/common';
import { type ParticipantFilter } from '../admin/admin-participants.repository';
import {
  AdminParticipantsQueryDto,
  ParticipantStatusFilter,
} from '../admin/dto/admin-participants-query.dto';
import {
  AdminRedemptionsQueryDto,
  AdminRedemptionStatusFilter,
  parseRedemptionDateRange,
} from '../rewards/dto/admin-redemptions-query.dto';
import {
  type RedemptionFilter,
  type RedemptionState,
} from '../rewards/rewards.repository';
import { serializeCsv, type CsvValue } from './csv';
import {
  ExportLimits,
  MAX_EXPORT_BYTES,
  MAX_EXPORT_ROWS,
} from './export-limits';
import {
  AdminExportsRepository,
  type ParticipantExportRow,
  type RedemptionExportRow,
} from './admin-exports.repository';

const PARTICIPANT_HEADER = [
  'nome',
  'email',
  'cpf',
  'status',
  'pontos',
  'xp',
  'nivel',
  'cadastrado_em',
] as const;

const REDEMPTION_HEADER = [
  'participante',
  'email',
  'recompensa',
  'pontos_gastos',
  'status',
  'solicitado_em',
  'entregue_em',
  'cancelado_em',
  'responsavel',
] as const;

@Injectable()
export class AdminExportsService {
  constructor(
    private readonly repository: AdminExportsRepository,
    private readonly limits: ExportLimits,
  ) {}

  async countParticipants(query: AdminParticipantsQueryDto) {
    const filter = toParticipantFilter(query);
    return {
      count: await this.repository.countParticipants(filter),
      maxRows: MAX_EXPORT_ROWS,
    };
  }

  async exportParticipants(query: AdminParticipantsQueryDto) {
    return this.limits.runCsv(async () => {
      const filter = toParticipantFilter(query);
      const count = await this.repository.countParticipants(filter);
      this.limits.assertRowCount(count);
      const rows: CsvValue[][] = [];
      let afterId: string | undefined;

      for (;;) {
        const block = await this.repository.findParticipantExportBlock(
          filter,
          afterId,
        );
        if (!block.length) break;
        rows.push(...block.map(toParticipantCsvRow));
        this.limits.assertRowCount(rows.length);
        afterId = block[block.length - 1]?.id;
      }

      return serializeCsv(PARTICIPANT_HEADER, rows, MAX_EXPORT_BYTES);
    });
  }

  async countRedemptions(query: AdminRedemptionsQueryDto) {
    const filter = toRedemptionFilter(query);
    return {
      count: await this.repository.countRedemptions(filter),
      maxRows: MAX_EXPORT_ROWS,
    };
  }

  async exportRedemptions(query: AdminRedemptionsQueryDto) {
    return this.limits.runCsv(async () => {
      const filter = toRedemptionFilter(query);
      const count = await this.repository.countRedemptions(filter);
      this.limits.assertRowCount(count);
      const rows: CsvValue[][] = [];
      let afterId: string | undefined;

      for (;;) {
        const block = await this.repository.findRedemptionExportBlock(
          filter,
          afterId,
        );
        if (!block.length) break;
        rows.push(...block.map(toRedemptionCsvRow));
        this.limits.assertRowCount(rows.length);
        afterId = block[block.length - 1]?.id;
      }

      return serializeCsv(REDEMPTION_HEADER, rows, MAX_EXPORT_BYTES);
    });
  }
}

function toParticipantFilter(
  query: Pick<AdminParticipantsQueryDto, 'search' | 'status'>,
): ParticipantFilter {
  return {
    search: query.search?.trim() || undefined,
    isActive:
      query.status === undefined
        ? undefined
        : query.status === ParticipantStatusFilter.ACTIVE,
  };
}

function toRedemptionFilter(
  query: Pick<
    AdminRedemptionsQueryDto,
    'search' | 'rewardId' | 'status' | 'from' | 'to'
  >,
): RedemptionFilter {
  return {
    search: query.search?.trim() || undefined,
    rewardId: query.rewardId?.trim() || undefined,
    status: mapRedemptionStatus(query.status),
    ...parseRedemptionDateRange(query),
  };
}

function mapRedemptionStatus(
  status: AdminRedemptionStatusFilter | undefined,
): RedemptionState | undefined {
  if (!status || status === AdminRedemptionStatusFilter.ALL) return undefined;
  return {
    [AdminRedemptionStatusFilter.PENDING]: 'PENDING',
    [AdminRedemptionStatusFilter.DELIVERED]: 'DELIVERED',
    [AdminRedemptionStatusFilter.CANCELLED]: 'CANCELLED',
  }[status] as RedemptionState;
}

function toParticipantCsvRow(row: ParticipantExportRow): CsvValue[] {
  return [
    row.name,
    row.email,
    row.cpf,
    row.isActive ? 'ATIVO' : 'INATIVO',
    row.points,
    row.xp,
    row.level,
    row.createdAt,
  ];
}

function toRedemptionCsvRow(row: RedemptionExportRow): CsvValue[] {
  return [
    row.user.name,
    row.user.email,
    row.reward.name,
    row.pointsSpent,
    row.status,
    row.createdAt,
    row.deliveredAt,
    row.cancelledAt,
    row.cancelledByAdmin?.name ?? row.deliveredByAdmin?.name ?? '',
  ];
}
