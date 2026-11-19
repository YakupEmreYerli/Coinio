import { describe, expect, it } from 'vitest';
import { dueDatesThrough, nextDue, todayIn } from '../src/shared/schedule.js';

describe('nextDue', () => {
  it('clamps month-end and returns to the anchor day', () => {
    expect(nextDue('2026-01-31', 'monthly', 1, 31)).toBe('2026-02-28');
    expect(nextDue('2026-02-28', 'monthly', 1, 31)).toBe('2026-03-31');
    expect(nextDue('2028-01-31', 'monthly', 1, 31)).toBe('2028-02-29');
  });
  it('drops Feb 29 yearly to Feb 28 in non-leap years', () => {
    expect(nextDue('2028-02-29', 'yearly', 1, 29)).toBe('2029-02-28');
  });
  it('handles weekly with interval, ignoring anchor day', () => {
    expect(nextDue('2026-11-18', 'weekly', 2, 18)).toBe('2026-12-02');
  });
  it('handles multi-month intervals across years', () => {
    expect(nextDue('2026-11-09', 'monthly', 3, 9)).toBe('2027-02-09');
  });
});

describe('dueDatesThrough', () => {
  it('lists due dates inclusive of both ends', () => {
    expect(dueDatesThrough('2026-09-09', '2026-11-18', 'monthly', 1, 9)).toEqual([
      '2026-09-09',
      '2026-10-09',
      '2026-11-09',
    ]);
    expect(dueDatesThrough('2026-09-09', '2026-11-09', 'monthly', 1, 9)).toHaveLength(3);
  });
  it('returns empty when from is after until', () => {
    expect(dueDatesThrough('2026-12-01', '2026-11-18', 'monthly', 1, 1)).toEqual([]);
  });
});

describe('todayIn', () => {
  it('uses the given timezone', () => {
    expect(todayIn('Europe/Istanbul', new Date('2026-11-18T21:30:00Z'))).toBe('2026-11-19');
    expect(todayIn('UTC', new Date('2026-11-18T21:30:00Z'))).toBe('2026-11-18');
  });
});
