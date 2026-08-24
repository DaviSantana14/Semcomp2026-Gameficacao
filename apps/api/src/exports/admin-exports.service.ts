import { Injectable } from '@nestjs/common';
import { maskClaimCode } from '../common/claim-code-mask';
import { parseOperationalDateRange } from '../common/operational-date-range';
import { mapPointEventOrigin } from '../common/point-event-origin';
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
  type CodeRedemptionExportRow,
  type PointEventExportRow,
  type ParticipantExportRow,
  type RedemptionExportRow,
} from './admin-exports.repository';
import {
  AdminPointEventKindFilter,
  AdminPointEventMethodFilter,
  AdminPointEventSourceFilter,
  AdminPointEventsQueryDto,
} from '../admin/dto/admin-point-events-query.dto';
import {
  CodeRedemptionsQueryDto,
  mapCodeRedemptionMethod,
} from '../claim-codes/dto/code-redemptions-query.dto';

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

const POINT_EVENT_HEADER = [
  'participante',
  'email',
  'tipo',
  'origem',
  'pontos_delta',
  'xp_delta',
  'referencia',
  'descricao',
  'ator',
  'criado_em',
] as const;

const CODE_REDEMPTION_HEADER = [
  'participante',
  'email',
  'atividade',
  'metodo',
  'codigo_mascarado',
  'pontos',
  'xp',
  'resgatado_em',
] as const;

type PointEventSourceValue =
  | 'ACTION_REDEEM'
  | 'ADMIN_GRANT'
  | 'ADMIN_ADJUST'
  | 'REWARD_REDEMPTION';
type PointEventKindValue = 'CREDIT' | 'DEBIT';
type ActionRedemptionMethodValue =
  | 'DIRECT'
  | 'REUSABLE_CODE'
  | 'CLAIM_CODE'
  | 'LEGACY_UNKNOWN';

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

  async countPointEvents(query: AdminPointEventsQueryDto) {
    const filter = toPointEventFilter(query);
    return {
      count: await this.repository.countPointEvents(filter),
      maxRows: MAX_EXPORT_ROWS,
    };
  }

  async exportPointEvents(query: AdminPointEventsQueryDto) {
    return this.limits.runCsv(async () => {
      const filter = toPointEventFilter(query);
      const count = await this.repository.countPointEvents(filter);
      this.limits.assertRowCount(count);
      const rows: CsvValue[][] = [];
      let afterId: string | undefined;

      for (;;) {
        const block = await this.repository.findPointEventExportBlock(
          filter,
          afterId,
        );
        if (!block.length) break;
        rows.push(...block.map(toPointEventCsvRow));
        this.limits.assertRowCount(rows.length);
        afterId = block[block.length - 1]?.id;
      }

      return serializeCsv(POINT_EVENT_HEADER, rows, MAX_EXPORT_BYTES);
    });
  }

  async countCodeRedemptions(query: CodeRedemptionsQueryDto) {
    const filter = toCodeRedemptionFilter(query);
    return {
      count: await this.repository.countCodeRedemptions(filter),
      maxRows: MAX_EXPORT_ROWS,
    };
  }

  async exportCodeRedemptions(query: CodeRedemptionsQueryDto) {
    return this.limits.runCsv(async () => {
      const filter = toCodeRedemptionFilter(query);
      const count = await this.repository.countCodeRedemptions(filter);
      this.limits.assertRowCount(count);
      const rows: CsvValue[][] = [];
      let afterId: string | undefined;

      for (;;) {
        const block = await this.repository.findCodeRedemptionExportBlock(
          filter,
          afterId,
        );
        if (!block.length) break;
        rows.push(...block.map(toCodeRedemptionCsvRow));
        this.limits.assertRowCount(rows.length);
        afterId = block[block.length - 1]?.id;
      }

      return serializeCsv(CODE_REDEMPTION_HEADER, rows, MAX_EXPORT_BYTES);
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

function toPointEventFilter(query: AdminPointEventsQueryDto) {
  const { from, to } = parseOperationalDateRange(query);
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 20,
    search: query.search?.trim() || undefined,
    source:
      query.source && query.source !== AdminPointEventSourceFilter.ALL
        ? (query.source.toUpperCase() as PointEventSourceValue)
        : undefined,
    kind:
      query.kind && query.kind !== AdminPointEventKindFilter.ALL
        ? (query.kind.toUpperCase() as PointEventKindValue)
        : undefined,
    method:
      query.method && query.method !== AdminPointEventMethodFilter.ALL
        ? (query.method.toUpperCase() as ActionRedemptionMethodValue)
        : undefined,
    from,
    to,
  };
}

function toCodeRedemptionFilter(query: CodeRedemptionsQueryDto) {
  const { from, to } = parseOperationalDateRange(query);
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 20,
    search: query.search?.trim() || undefined,
    actionId: query.actionId?.trim() || undefined,
    method: mapCodeRedemptionMethod(query.method),
    from,
    to,
  };
}

function toPointEventCsvRow(row: PointEventExportRow): CsvValue[] {
  return [
    row.user.name,
    row.user.email,
    row.kind,
    mapPointEventOrigin(
      row.source,
      row.redemptionMethod,
      row.auditEvent?.operation,
    ),
    row.points,
    row.xpDelta,
    pointEventReferenceLabel(row),
    row.description,
    row.actorAdmin?.name ?? '',
    row.createdAt,
  ];
}

function toCodeRedemptionCsvRow(row: CodeRedemptionExportRow): CsvValue[] {
  return [
    row.user.name,
    row.user.email,
    row.action?.name ?? '',
    row.redemptionMethod,
    maskedPointEventCode(row),
    row.points,
    row.xpDelta,
    row.createdAt,
  ];
}

function maskedPointEventCode(row: {
  claimCode: { code: string } | null;
  action: { code: string | null } | null;
}) {
  const rawCode = row.claimCode?.code ?? row.action?.code ?? null;
  return rawCode ? maskClaimCode(rawCode) : null;
}

function pointEventReferenceLabel(row: PointEventExportRow) {
  const actionName = row.action?.name.trim();
  if (actionName) return actionName;
  const rewardName = row.rewardRedemption?.reward.name.trim();
  if (rewardName) return rewardName;
  if (row.auditEvent?.operation) return row.auditEvent.operation;
  return row.description?.trim() || 'Evento de pontos';
}
