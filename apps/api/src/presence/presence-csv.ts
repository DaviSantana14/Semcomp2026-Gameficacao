import { formatOperationalDateTime } from '../common/operational-time';

export type PresenceGeneralExportRow = {
  onlineNow: number;
  overallPeak: {
    operationalDate: Date | string | null;
    onlineParticipants: number;
    observedAt: Date | string | null;
    registeredParticipantsAtPeak: number;
  };
  uniqueParticipantsEverLogged: number;
  registeredParticipants: number;
  monitoredDays: number;
  lastCollectedAt: Date | string | null;
};

export type PresenceDailyExportRow = {
  operationalDate: Date | string;
  onlineAtLastCollection: number;
  peakOnlineParticipants: number;
  peakAt: Date | string | null;
  registeredParticipantsAtPeak: number;
  uniqueParticipantLogins: number;
  newParticipantRegistrations: number;
  lastCollectedAt: Date | string;
};

const HEADER = [
  'tipo',
  'periodo',
  'online_ultima_coleta',
  'pico_online',
  'pico_em',
  'cadastrados_no_pico',
  'logins_unicos',
  'novos_cadastros',
  'cadastrados_totais',
  'dias_monitorados',
  'ultima_coleta_em',
];

export function serializePresenceCsv(
  general: PresenceGeneralExportRow,
  daily: PresenceDailyExportRow[],
): string {
  const generalRow = [
    'GERAL',
    'GERAL',
    general.onlineNow,
    general.overallPeak.onlineParticipants,
    formatDateTime(general.overallPeak.observedAt),
    general.overallPeak.registeredParticipantsAtPeak,
    general.uniqueParticipantsEverLogged,
    '',
    general.registeredParticipants,
    general.monitoredDays,
    formatDateTime(general.lastCollectedAt),
  ];

  const dailyRows = [...daily]
    .sort((first, second) =>
      formatDateOnly(first.operationalDate).localeCompare(
        formatDateOnly(second.operationalDate),
      ),
    )
    .map((row) => [
      'DIARIO',
      formatDateOnly(row.operationalDate),
      row.onlineAtLastCollection,
      row.peakOnlineParticipants,
      formatDateTime(row.peakAt),
      row.registeredParticipantsAtPeak,
      row.uniqueParticipantLogins,
      row.newParticipantRegistrations,
      '',
      '',
      formatDateTime(row.lastCollectedAt),
    ]);

  const rows = [HEADER, generalRow, ...dailyRows].map((row) =>
    row.map((field) => escapeCsvField(field)).join(';'),
  );

  return `\ufeff${rows.join('\r\n')}\r\n`;
}

export function escapeCsvField(
  value: string | number | null | undefined,
): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[;"\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function formatDateOnly(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function formatDateTime(value: Date | string | null): string {
  if (value === null) {
    return '';
  }
  return value instanceof Date ? formatOperationalDateTime(value) : value;
}
