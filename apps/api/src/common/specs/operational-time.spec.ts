import {
  OPERATIONAL_TIME_ZONE,
  addUtcDays,
  addUtcMonths,
  formatOperationalDateTime,
  operationalDateUtc,
  startOfOperationalDayUtc,
} from '../operational-time';

describe('operational time', () => {
  it('uses São Paulo as the single operational timezone', () => {
    expect(OPERATIONAL_TIME_ZONE).toBe('America/Sao_Paulo');
  });

  it.each([
    ['2026-08-21T02:59:59.999Z', '2026-08-20T03:00:00.000Z'],
    ['2026-08-21T03:00:00.000Z', '2026-08-21T03:00:00.000Z'],
  ])('finds São Paulo day start for %s', (input, expected) => {
    expect(startOfOperationalDayUtc(new Date(input)).toISOString()).toBe(
      expected,
    );
  });

  it('returns the operational calendar date at UTC midnight', () => {
    expect(
      operationalDateUtc(new Date('2026-08-21T02:59:59.999Z')).toISOString(),
    ).toBe('2026-08-20T00:00:00.000Z');
    expect(
      operationalDateUtc(new Date('2026-08-21T03:00:00.000Z')).toISOString(),
    ).toBe('2026-08-21T00:00:00.000Z');
  });

  it('adds calendar days and months without changing the UTC anchor', () => {
    const date = new Date('2026-08-21T00:00:00.000Z');

    expect(addUtcDays(date, 1).toISOString()).toBe('2026-08-22T00:00:00.000Z');
    expect(addUtcMonths(date, -1).toISOString()).toBe(
      '2026-07-21T00:00:00.000Z',
    );
  });

  it('formats timestamps with the São Paulo offset and no milliseconds', () => {
    expect(
      formatOperationalDateTime(new Date('2026-08-21T15:04:05.987Z')),
    ).toBe('2026-08-21T12:04:05-03:00');
  });
});
