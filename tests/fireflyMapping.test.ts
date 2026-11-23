import { describe, expect, it } from 'vitest';
import type { SubscriptionRow } from '../src/server/domain/summary.js';
import type { FfBill } from '../src/server/services/firefly/client.js';
import {
  billWrite, fromFireflyFreq, hashMapped, mappedFromBill, mappedFromSubscription, sameName, subscriptionInput,
  subscriptionPatch, toFireflyFreq,
} from '../src/server/services/firefly/mapping.js';
import { SubscriptionInput, SubscriptionPatch } from '../src/shared/types.js';
import type { Cycle } from '../src/shared/schedule.js';

const sub = (over: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  id: 1, userId: 1, name: 'Spotify', domain: null, logoPath: null, amountMinor: 2500, currency: 'EUR', variableAmount: false,
  cycle: 'monthly', intervalCount: 1, anchorDay: 9, nextDue: '2026-12-09', autoPay: true, paymentMethod: null, category: null,
  notes: null, reminderOffsets: null, trialEndsAt: null, active: true, createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z', ...over,
});

const bill = (over: Partial<FfBill> = {}): FfBill => ({
  id: '7', name: 'Spotify', amountMin: '25.00', amountMax: '25.00', currencyCode: 'EUR', date: '2026-01-09T00:00:00+01:00',
  repeatFreq: 'monthly', skip: 0, active: true, notes: null, updatedAt: '2026-01-01T00:00:00+01:00', nextExpectedMatch: null,
  ...over,
});

/** The bill Firefly would hold after `billWrite`. */
const asBill = (w: ReturnType<typeof billWrite>): FfBill =>
  bill({
    name: w.name, amountMin: w.amount_min, amountMax: w.amount_max, currencyCode: w.currency_code, date: w.date,
    repeatFreq: w.repeat_freq, skip: w.skip, active: w.active, notes: w.notes,
  });

describe('frequency', () => {
  const table: [Cycle, number, FfBill['repeatFreq'], number][] = [
    ['weekly', 1, 'weekly', 0], ['weekly', 2, 'weekly', 1], ['monthly', 1, 'monthly', 0], ['monthly', 3, 'quarterly', 0],
    ['monthly', 6, 'half-year', 0], ['monthly', 2, 'monthly', 1], ['monthly', 12, 'monthly', 11], ['yearly', 1, 'yearly', 0],
    ['yearly', 2, 'yearly', 1],
  ];
  it.each(table)('%s ×%i ↔ %s skip %i', (cycle, n, freq, skip) => {
    expect(toFireflyFreq(cycle, n)).toEqual({ repeat_freq: freq, skip });
    expect(fromFireflyFreq(freq, skip)).toEqual({ cycle, intervalCount: n });
  });
  it('reads skipped quarters and half-years as months', () => {
    expect(fromFireflyFreq('quarterly', 1)).toEqual({ cycle: 'monthly', intervalCount: 6 });
    expect(fromFireflyFreq('half-year', 1)).toEqual({ cycle: 'monthly', intervalCount: 12 });
  });
});

describe('mapping', () => {
  it('hash is equal for a subscription and the bill written from it', () => {
    for (const s of [sub(), sub({ cycle: 'monthly', intervalCount: 3, notes: 'family plan' }), sub({ cycle: 'weekly', intervalCount: 2 })]) {
      const w = billWrite(s, null, { withDate: true }) as Required<ReturnType<typeof billWrite>>;
      expect(hashMapped(mappedFromBill(asBill(w)))).toBe(hashMapped(mappedFromSubscription(s)));
    }
  });
  it('hash trims the name and treats empty notes as null', () => {
    expect(hashMapped(mappedFromBill(bill({ name: ' Spotify ', notes: '' })))).toBe(hashMapped(mappedFromBill(bill())));
    expect(hashMapped(mappedFromBill(bill({ amountMax: '26.00' })))).not.toBe(hashMapped(mappedFromBill(bill())));
  });
  it('reads amount_max as the amount and a range as variable', () => {
    expect(mappedFromBill(bill({ amountMin: '10.00', amountMax: '25.50' }))).toMatchObject({ amountMinor: 2550, variable: true });
  });
  it('rejects an amount the currency cannot hold', () => {
    expect(() => mappedFromBill(bill({ amountMax: '25.001' }))).toThrow('bad amount');
  });
  it('variable bill keeps amount_min on write', () => {
    const w = billWrite(sub({ variableAmount: true }), bill({ amountMin: '10.00', amountMax: '20.00' }), { withDate: false });
    expect(w).toMatchObject({ amount_min: '10.00', amount_max: '25.00' });
    expect(w).not.toHaveProperty('date');
  });
  it('a fixed or new bill gets amount_min = amount_max', () => {
    expect(billWrite(sub(), bill({ amountMin: '10.00' }), { withDate: false })).toMatchObject({ amount_min: '25.00', amount_max: '25.00' });
    expect(billWrite(sub({ variableAmount: true }), null, { withDate: true })).toMatchObject({
      amount_min: '25.00', amount_max: '25.00', date: '2026-12-09', repeat_freq: 'monthly', skip: 0,
    });
  });
  it('sameName ignores case and spaces', () => {
    expect(sameName('Spotify ', 'spot ify')).toBe(true);
    expect(sameName('Spotify', 'Netflix')).toBe(false);
  });
  it('subscriptionPatch sets only the mapped fields', () => {
    const p = subscriptionPatch(bill({ repeatFreq: 'quarterly', amountMin: '10.00', notes: 'x' }));
    expect(p).toEqual({
      name: 'Spotify', amountMinor: 2500, currency: 'EUR', variableAmount: true, cycle: 'monthly', intervalCount: 3,
      active: true, notes: 'x',
    });
    expect(SubscriptionPatch.safeParse(p).success).toBe(true);
  });
  it('subscriptionInput takes next_expected_match as nextDue', () => {
    const i = subscriptionInput(bill({ nextExpectedMatch: '2026-12-09T00:00:00+01:00' }), '2026-11-18');
    expect(SubscriptionInput.parse(i)).toMatchObject({ nextDue: '2026-12-09', autoPay: false, amountMinor: 2500 });
  });
  it('subscriptionInput falls back to date stepped to today', () => {
    const i = subscriptionInput(bill({ date: '2026-01-09' }), '2026-11-18');
    expect(SubscriptionInput.parse(i).nextDue).toBe('2026-12-09');
  });
});
