import { describe, expect, it } from 'vitest';
import { monthWeeks } from './dates';
import type { DayItem } from './projection';
import { dayTotal, defaultDay, monthSummary, weekTotals } from './totals';

const item = (dueDate: string, state: DayItem['state'], baseMinor: number | null, id = 1): DayItem => ({ subscriptionId: id, dueDate, state, baseMinor });

describe('calendar totals', () => {
  it('dayTotal skips skipped dates and missing rates', () => {
    expect(dayTotal([item('2026-11-02', 'due', 1000), item('2026-11-02', 'skipped', 500, 2), item('2026-11-02', 'projected', null, 3)])).toBe(1000);
  });

  it('monthWeeks covers the month in Monday-first rows', () => {
    const weeks = monthWeeks('2026-11'); // Nov 1 2026 is a Sunday
    expect(weeks).toHaveLength(6);
    expect(weeks[0]![0]).toBe('2026-10-26');
    expect(weeks[0]![6]).toBe('2026-11-01');
    expect(weeks[5]![0]).toBe('2026-11-30');
    expect(weeks[5]![6]).toBe('2026-12-06');
    expect(monthWeeks('2021-02')).toHaveLength(4); // Feb 2021 starts on a Monday, 28 days
  });

  it('weekTotals sums each row', () => {
    const days = {
      '2026-11-01': [item('2026-11-01', 'paid', 300)],
      '2026-11-03': [item('2026-11-03', 'due', 1000), item('2026-11-03', 'due', 250, 2)],
      '2026-11-08': [item('2026-11-08', 'skipped', 999)],
      '2026-11-30': [item('2026-11-30', 'projected', 4000)],
    };
    expect(weekTotals(monthWeeks('2026-11'), days)).toEqual([300, 1250, 0, 0, 0, 4000]);
  });

  it('monthSummary splits paid from remaining and counts overdue', () => {
    const days = {
      '2026-11-01': [item('2026-11-01', 'paid', 300)],
      '2026-11-03': [item('2026-11-03', 'overdue', 1000), item('2026-11-03', 'skipped', 250, 2)],
      '2026-11-20': [item('2026-11-20', 'due', 700), item('2026-11-20', 'projected', null, 3)],
    };
    expect(monthSummary(days)).toEqual({ total: 2000, paid: 300, remaining: 1700, count: 4, overdue: 1 });
  });

  it('defaultDay prefers today, then the next payment day', () => {
    const days = { '2026-11-03': [item('2026-11-03', 'paid', 1)], '2026-11-25': [item('2026-11-25', 'due', 1)] };
    expect(defaultDay('2026-11', '2026-11-03', days)).toBe('2026-11-03');
    expect(defaultDay('2026-11', '2026-11-10', days)).toBe('2026-11-25');
    expect(defaultDay('2026-11', '2026-11-28', days)).toBe('2026-11-28');
    expect(defaultDay('2026-12', '2026-11-28', {})).toBe('2026-12-01');
    expect(defaultDay('2026-10', '2026-11-28', { '2026-10-07': [item('2026-10-07', 'paid', 1)] })).toBe('2026-10-07');
  });
});
