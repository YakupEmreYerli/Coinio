import type { DayItem } from './projection';

/** What a day costs in the base currency; skipped dates and amounts without a rate count as zero. */
export function dayTotal(items: DayItem[]): number {
  return items.reduce((s, i) => s + (i.state === 'skipped' ? 0 : (i.baseMinor ?? 0)), 0);
}

/** One total per week row; days outside the month have no items and add nothing. */
export function weekTotals(weeks: string[][], days: Record<string, DayItem[]>): number[] {
  return weeks.map((week) => week.reduce((s, d) => s + dayTotal(days[d] ?? []), 0));
}

export type MonthSummary = { total: number; paid: number; remaining: number; count: number; overdue: number };

/** Month header figures: skipped dates are left out of every number. */
export function monthSummary(days: Record<string, DayItem[]>): MonthSummary {
  const sum: MonthSummary = { total: 0, paid: 0, remaining: 0, count: 0, overdue: 0 };
  for (const items of Object.values(days)) {
    for (const it of items) {
      if (it.state === 'skipped') continue;
      const v = it.baseMinor ?? 0;
      sum.count += 1;
      sum.total += v;
      if (it.state === 'paid') sum.paid += v;
      else sum.remaining += v;
      if (it.state === 'overdue') sum.overdue += 1;
    }
  }
  return sum;
}

/** The day the side panel opens on: today when it has payments, else the next payment day, else today or the 1st. */
export function defaultDay(month: string, today: string, days: Record<string, DayItem[]>): string {
  const dates = Object.keys(days).filter((d) => d.startsWith(month)).sort();
  if (today.startsWith(month)) {
    if (days[today]?.length) return today;
    return dates.find((d) => d > today) ?? today;
  }
  return dates[0] ?? `${month}-01`;
}
