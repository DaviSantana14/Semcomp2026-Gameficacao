export const OPERATIONAL_TIME_ZONE = 'America/Sao_Paulo';

export function startOfOperationalDayUtc(date: Date): Date {
  const parts = getOperationalParts(date);
  const localMidnightAsUtc = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day),
  );
  return new Date(
    localMidnightAsUtc.getTime() -
      getTimeZoneOffsetInMs(localMidnightAsUtc, OPERATIONAL_TIME_ZONE),
  );
}

export function operationalDateUtc(date: Date): Date {
  const parts = getOperationalParts(date);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

export function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function addUtcMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
  return result;
}

export function formatOperationalDateTime(date: Date): string {
  const parts = getOperationalParts(date, true);
  const offsetInMinutes = Math.round(
    getTimeZoneOffsetInMs(date, OPERATIONAL_TIME_ZONE) / (60 * 1000),
  );
  const sign = offsetInMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetInMinutes);
  const offsetHours = Math.floor(absoluteOffset / 60);
  const offsetMinutes = absoluteOffset % 60;

  return `${parts.year.toString().padStart(4, '0')}-${parts.month
    .toString()
    .padStart(2, '0')}-${parts.day.toString().padStart(2, '0')}T${parts.hour
    .toString()
    .padStart(
      2,
      '0',
    )}:${parts.minute.toString().padStart(2, '0')}:${parts.second
    .toString()
    .padStart(2, '0')}${sign}${offsetHours
    .toString()
    .padStart(2, '0')}:${offsetMinutes.toString().padStart(2, '0')}`;
}

function getOperationalParts(date: Date): {
  year: number;
  month: number;
  day: number;
};
function getOperationalParts(
  date: Date,
  includeTime: true,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};
function getOperationalParts(date: Date, includeTime = false) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: OPERATIONAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(includeTime && {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }),
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );

  if (!includeTime) {
    return { year: values.year, month: values.month, day: values.day };
  }
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function getTimeZoneOffsetInMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return (
    Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second,
    ) - date.getTime()
  );
}
