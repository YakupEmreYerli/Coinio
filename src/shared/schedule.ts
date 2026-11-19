export type Cycle = 'weekly' | 'monthly' | 'yearly';

function parse(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return { y, m, d };
}

function format(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Next due date after `current`; monthly/yearly keep `anchorDay`, clamped to the month length. */
export function nextDue(current: string, cycle: Cycle, intervalCount: number, anchorDay: number): string {
  const { y, m, d } = parse(current);
  if (cycle === 'weekly') {
    const t = new Date(Date.UTC(y, m - 1, d + 7 * intervalCount));
    return format(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  const months = cycle === 'yearly' ? 12 * intervalCount : intervalCount;
  const index = y * 12 + (m - 1) + months;
  const ny = Math.floor(index / 12);
  const nm = (index % 12) + 1;
  return format(ny, nm, Math.min(anchorDay, daysInMonth(ny, nm)));
}

/** Due dates from `from` through `until`, both inclusive, ascending. */
export function dueDatesThrough(
  from: string,
  until: string,
  cycle: Cycle,
  intervalCount: number,
  anchorDay: number,
): string[] {
  const dates: string[] = [];
  for (let d = from; d <= until; d = nextDue(d, cycle, intervalCount, anchorDay)) dates.push(d);
  return dates;
}

/** Calendar date (YYYY-MM-DD) of `now` in the given IANA timezone. */
export function todayIn(tz: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
