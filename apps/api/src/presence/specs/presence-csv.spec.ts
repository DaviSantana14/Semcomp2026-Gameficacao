import {
  PresenceDailyExportRow,
  PresenceGeneralExportRow,
  serializePresenceCsv,
} from '../presence-csv';

describe('serializePresenceCsv', () => {
  const general: PresenceGeneralExportRow = {
    onlineNow: 7,
    overallPeak: {
      operationalDate: new Date('2026-08-20T00:00:00.000Z'),
      onlineParticipants: 9,
      observedAt: new Date('2026-08-20T15:00:00.000Z'),
      registeredParticipantsAtPeak: 10,
    },
    uniqueParticipantsEverLogged: 15,
    registeredParticipants: 20,
    monitoredDays: 2,
    lastCollectedAt: new Date('2026-08-22T12:00:00.000Z'),
  };
  const daily: PresenceDailyExportRow[] = [
    {
      operationalDate: new Date('2026-08-20T00:00:00.000Z'),
      onlineAtLastCollection: 3,
      peakOnlineParticipants: 5,
      peakAt: new Date('2026-08-20T12:00:00.000Z'),
      registeredParticipantsAtPeak: 6,
      uniqueParticipantLogins: 4,
      newParticipantRegistrations: 1,
      lastCollectedAt: new Date('2026-08-20T15:00:00.000Z'),
    },
    {
      operationalDate: new Date('2026-08-21T00:00:00.000Z'),
      onlineAtLastCollection: 4,
      peakOnlineParticipants: 7,
      peakAt: new Date('2026-08-21T13:00:00.000Z'),
      registeredParticipantsAtPeak: 8,
      uniqueParticipantLogins: 5,
      newParticipantRegistrations: 2,
      lastCollectedAt: new Date('2026-08-21T15:00:00.000Z'),
    },
  ];

  it('writes one aggregate row and deterministic ascending daily rows', () => {
    const csv = serializePresenceCsv(general, daily);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain(
      'tipo;periodo;online_ultima_coleta;pico_online;pico_em;cadastrados_no_pico;logins_unicos;novos_cadastros;cadastrados_totais;dias_monitorados;ultima_coleta_em',
    );
    expect(csv.match(/^GERAL;/gm)).toHaveLength(1);
    expect(csv.match(/^DIARIO;/gm)).toHaveLength(2);
    expect(csv.indexOf('DIARIO;2026-08-20')).toBeLessThan(
      csv.indexOf('DIARIO;2026-08-21'),
    );
    expect(csv).not.toMatch(/cpf|email|userId|jti/i);
  });

  it('uses CRLF, São Paulo offsets, and CSV quote escaping', () => {
    const csv = serializePresenceCsv(
      {
        ...general,
        lastCollectedAt: '2026-08-22T12:00:00-03:00;"quoted"',
      },
      daily,
    );

    expect(csv).toContain('\r\n');
    expect(csv).not.toMatch(/(^|[^\r])\n/);
    expect(csv).toContain('2026-08-20T12:00:00-03:00');
    expect(csv).toContain('"2026-08-22T12:00:00-03:00;""quoted"""');
  });

  it('keeps the general row when there are no daily rows', () => {
    const csv = serializePresenceCsv(general, []);

    expect(csv.match(/^GERAL;/gm)).toHaveLength(1);
    expect(csv.match(/^DIARIO;/gm)).toBeNull();
  });

  it('defends formula-like aggregate text fields', () => {
    const csv = serializePresenceCsv(
      {
        ...general,
        lastCollectedAt: '=1+1',
      },
      [],
    );

    expect(csv).toContain("'=1+1");
  });
});
