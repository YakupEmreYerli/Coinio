import { describe, expect, it } from 'vitest';
import { dateTimeIn, whenIn } from './dates';

const now = new Date('2026-11-20T12:00:00Z');

describe('whenIn', () => {
  it('uses the user zone for the calendar day', () => {
    // 22:30 UTC on Nov 1 is already Nov 2 in Istanbul (UTC+3).
    expect(whenIn('2026-11-01T22:30:00Z', 'en', 'UTC', now)).toBe('Nov 1');
    expect(whenIn('2026-11-01T22:30:00Z', 'en', 'Europe/Istanbul', now)).toBe('Nov 2');
    expect(whenIn('2026-11-01T22:30:00Z', 'tr', 'Europe/Istanbul', now)).toBe('2 Kas');
  });

  it('says yesterday by the zone calendar, not by 24 hours', () => {
    // 26 hours earlier, on the previous calendar day in both zones.
    expect(whenIn('2026-11-19T10:00:00Z', 'en', 'UTC', now)).toBe('yesterday');
    expect(whenIn('2026-11-19T10:00:00Z', 'tr', 'Europe/Istanbul', now)).toBe('dün');
  });

  it('is relative while recent', () => {
    expect(whenIn('2026-11-20T11:59:40Z', 'en', 'UTC', now)).toBe('now');
    expect(whenIn('2026-11-20T11:15:00Z', 'en', 'UTC', now)).toBe('45 minutes ago');
    expect(whenIn('2026-11-20T10:00:00Z', 'tr', 'UTC', now)).toBe('2 saat önce');
    expect(whenIn('2026-11-16T10:00:00Z', 'en', 'UTC', now)).toBe('4 days ago');
  });

  it('adds the year for another year', () => {
    expect(whenIn('2025-03-04T10:00:00Z', 'en', 'UTC', now)).toBe('Mar 4, 2025');
  });
});

describe('dateTimeIn', () => {
  it('shows the time in the given zone', () => {
    expect(dateTimeIn('2026-11-01T22:30:00Z', 'en', 'UTC')).toMatch(/November 1, 2026.*10:30/);
    expect(dateTimeIn('2026-11-01T22:30:00Z', 'tr', 'Europe/Istanbul')).toMatch(/2 Kasım 2026.*01:30/);
  });
});
