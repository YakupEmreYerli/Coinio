import { describe, expect, it } from 'vitest';
import { convertMinor, type Rates } from '../src/server/domain/money.js';

const r: Rates = { base: 'TRY', date: '2026-11-18', stale: false, rates: { USD: 42.5 } };

describe('convertMinor', () => {
  it('converts using 1 X = rate base', () => {
    expect(convertMinor(10000, 'USD', r)).toBe(425000);
  });
  it('returns the amount unchanged for the base currency', () => {
    expect(convertMinor(500, 'TRY', r)).toBe(500);
  });
  it('returns null when no rate is known', () => {
    expect(convertMinor(100, 'GBP', r)).toBeNull();
  });
  it('rounds the result to whole minor units', () => {
    expect(convertMinor(333, 'USD', { ...r, rates: { USD: 0.5 } })).toBe(167);
  });
  it('scales between currencies with different decimals', () => {
    expect(convertMinor(1000, 'JPY', { ...r, base: 'USD', rates: { JPY: 0.0065 } })).toBe(650);
    expect(convertMinor(2000, 'USD', { ...r, base: 'JPY', rates: { USD: 155 } })).toBe(3100);
  });
});
