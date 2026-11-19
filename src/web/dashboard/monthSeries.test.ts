import { describe, expect, it } from 'vitest';
import { buildMonthSeries } from './monthSeries';

describe('buildMonthSeries', () => {
  it('buildMonthSeries accumulates paid and projects pending', () => {
    const s = buildMonthSeries({
      today: '2026-11-19',
      paid: [
        { dueDate: '2026-11-09', baseMinor: 433800, subscriptionId: 6 },
        { dueDate: '2026-11-15', baseMinor: 100000, subscriptionId: 7 },
        { dueDate: '2026-11-15', baseMinor: 4998, subscriptionId: 8 },
      ],
      pending: [
        { dueDate: '2026-11-17', baseMinor: 125000, overdue: true, subscriptionId: 1 },
        { dueDate: '2026-11-22', baseMinor: 86800, overdue: false, subscriptionId: 2 },
        { dueDate: '2026-11-28', baseMinor: 9999, overdue: false, subscriptionId: 3 },
      ],
    });
    expect(s.paid).toEqual([[1, 0], [9, 0], [9, 433800], [15, 433800], [15, 538798], [19, 538798]]);
    expect(s.projected).toEqual([[19, 538798], [19, 663798], [22, 663798], [22, 750598], [28, 750598], [28, 760597], [30, 760597]]);
    expect(s.daysInMonth).toBe(30);
    expect(s.markers.map((m) => [m.day, m.state, m.subscriptionId])).toEqual([
      [9, 'paid', 6], [15, 'paid', 7], [15, 'paid', 8], [19, 'overdue', 1], [22, 'pending', 2], [28, 'pending', 3],
    ]);
    expect(s.total).toBe(760597);
  });

  it('handles an empty month', () => {
    const s = buildMonthSeries({ today: '2026-02-10', paid: [], pending: [] });
    expect(s.paid).toEqual([[1, 0], [10, 0]]);
    expect(s.projected).toEqual([[10, 0], [28, 0]]);
    expect(s.markers).toEqual([]);
  });

  it('an early payment for a later day counts on today, never runs backwards', () => {
    const s = buildMonthSeries({ today: '2026-11-19', paid: [{ dueDate: '2026-11-28', baseMinor: 9999, subscriptionId: 3 }], pending: [] });
    const xs = s.paid.map((p) => p[0]);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(Math.max(...xs)).toBe(19);
    expect(s.markers[0]).toMatchObject({ day: 19, state: 'paid' });
    expect(s.projected[0]).toEqual([19, 9999]);
  });
});
