/** Small date helpers for YYYY-MM / YYYY-MM-DD strings, all in UTC so the viewer's zone never shifts a day. */

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const i = y * 12 + (m - 1) + by;
  return `${String(Math.floor(i / 12)).padStart(4, '0')}-${String((i % 12) + 1).padStart(2, '0')}`;
}

export function daysIn(month: string): number {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export const utc = (date: string) => new Date(`${date}T00:00:00Z`);

/** 0 = Monday … 6 = Sunday. */
export const weekdayIndex = (date: string) => (utc(date).getUTCDay() + 6) % 7;

export const isMonth = (v: string | null): v is string => !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export function fmt(date: string, locale: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' }).format(utc(date));
}
