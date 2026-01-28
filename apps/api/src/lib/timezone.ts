type IsoDateParts = {
  year: number;
  month: number;
  day: number;
};

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function getTimeZoneFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = dtfCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  dtfCache.set(timeZone, formatter);
  return formatter;
}

export function parseIsoDate(dateStr: string): IsoDateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) throw new Error('Invalid ISO date');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() + 1 !== month || utc.getUTCDate() !== day) {
    throw new Error('Invalid ISO date');
  }

  return { year, month, day };
}

export function isoDateAddDays(dateStr: string, days: number): string {
  const { year, month, day } = parseIsoDate(dateStr);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

export function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getTimeZoneFormatter(timeZone).formatToParts(date);
  const values: Record<string, string> = {};

  for (const part of parts) {
    if (part.type === 'literal') continue;
    values[part.type] = part.value;
  }

  const year = Number(values['year']);
  const month = Number(values['month']);
  const day = Number(values['day']);
  const hour = Number(values['hour']);
  const minute = Number(values['minute']);
  const second = Number(values['second']);

  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUtc - date.getTime();
}

export function zonedTimeToUtc(
  local: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number; millisecond?: number },
  timeZone: string,
): Date {
  const hour = local.hour ?? 0;
  const minute = local.minute ?? 0;
  const second = local.second ?? 0;
  const millisecond = local.millisecond ?? 0;

  const utcGuess = new Date(Date.UTC(local.year, local.month - 1, local.day, hour, minute, second, millisecond));
  const offset1 = getTimeZoneOffsetMs(utcGuess, timeZone);
  const utc1 = new Date(utcGuess.getTime() - offset1);
  const offset2 = getTimeZoneOffsetMs(utc1, timeZone);

  if (offset2 === offset1) return utc1;
  return new Date(utcGuess.getTime() - offset2);
}

