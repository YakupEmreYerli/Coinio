import { describe, expect, it } from 'vitest';
import type { Rates } from '../src/server/domain/money.js';
import { computeSummary, type PaymentRow, type SubscriptionRow } from '../src/server/domain/summary.js';

const today = '2026-11-18';
const rates: Rates = { base: 'TRY', date: '2026-11-18', stale: true, rates: { USD: 42.5 } };

let seq = 0;
function sub(over: Partial<SubscriptionRow>): SubscriptionRow {
  seq += 1;
  return {
    id: seq,
    userId: 1,
    name: `Sub ${seq}`,
    domain: null,
    logoPath: null,
    amountMinor: 10000,
    currency: 'TRY',
    variableAmount: false,
    cycle: 'monthly',
    intervalCount: 1,
    anchorDay: 22,
    nextDue: '2026-11-22',
    autoPay: true,
    paymentMethod: null,
    category: null,
    notes: null,
    reminderOffsets: null,
    trialEndsAt: null,
    active: true,
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

function pay(over: Partial<PaymentRow> & Pick<PaymentRow, 'subscriptionId' | 'dueDate'>): PaymentRow {
  seq += 1;
  return {
    id: seq,
    paidAt: '2026-11-10T08:00:00Z',
    amountMinor: 10000,
    currency: 'TRY',
    actualBaseMinor: null,
    source: 'manual',
    status: 'paid',
    ...over,
  };
}

const run = (subs: SubscriptionRow[], payments: PaymentRow[] = []) =>
  computeSummary({ subs, payments, today, rates });

describe('computeSummary', () => {
  it('averages monthly and yearly subscriptions and counts what is left this month', () => {
    const s = run([
      sub({ amountMinor: 99999, anchorDay: 22, nextDue: '2026-11-22' }),
      sub({ amountMinor: 120000, cycle: 'yearly', anchorDay: 1, nextDue: '2027-03-01' }),
    ]);
    expect(s.monthlyAverageMinor).toBe(99999 + 10000);
    expect(s.yearlyTotalMinor).toBe(99999 * 12 + 120000);
    expect(s.leftThisMonthMinor).toBe(99999);
    expect(s.ratesStale).toBe(false);
  });

  it('lists unpaid manual past dues as overdue and counts them in leftThisMonth', () => {
    const s = run([sub({ autoPay: false, anchorDay: 9, nextDue: '2026-11-09', amountMinor: 5000 })]);
    expect(s.overdue.map((i) => i.dueDate)).toEqual(['2026-11-09']);
    expect(s.overdue[0]!.daysLeft).toBe(-9);
    expect(s.leftThisMonthMinor).toBe(5000);
  });

  it('never marks auto-pay subscriptions overdue', () => {
    const s = run([sub({ autoPay: true, anchorDay: 9, nextDue: '2026-11-09' })]);
    expect(s.overdue).toEqual([]);
    expect(s.upcoming.map((i) => i.dueDate)).toEqual(['2026-12-09', '2027-01-09']);
    expect(s.leftThisMonthMinor).toBe(0);
  });

  it('converts foreign currency and skips unconvertible ones in totals', () => {
    const usd = sub({ amountMinor: 10000, currency: 'USD' });
    const gbp = sub({ amountMinor: 10000, currency: 'GBP' });
    const s = run([usd, gbp]);
    expect(s.upcoming.find((i) => i.subscriptionId === usd.id)!.baseMinor).toBe(425000);
    expect(s.unconvertible).toEqual([gbp.id]);
    expect(s.monthlyAverageMinor).toBe(425000);
    expect(s.leftThisMonthMinor).toBe(425000);
    expect(s.ratesStale).toBe(true);
  });

  it('keeps paid dues out of upcoming and leftThisMonth; ignores void payments', () => {
    const a = sub({ anchorDay: 22, nextDue: '2026-11-22' });
    const b = sub({ anchorDay: 9, nextDue: '2026-11-09', autoPay: false });
    const s = run(
      [a, b],
      [
        pay({ subscriptionId: a.id, dueDate: '2026-11-22', paidAt: '2026-11-17T08:00:00Z' }),
        pay({ subscriptionId: b.id, dueDate: '2026-11-09', status: 'void' }),
      ],
    );
    expect(s.paidThisMonth.map((p) => p.subscriptionId)).toEqual([a.id]);
    expect(s.upcoming.some((i) => i.subscriptionId === a.id && i.dueDate === '2026-11-22')).toBe(false);
    expect(s.overdue.map((i) => i.subscriptionId)).toEqual([b.id]);
    expect(s.leftThisMonthMinor).toBe(10000);
  });

  it('includes every weekly occurrence this month and within 60 days', () => {
    const s = run([sub({ cycle: 'weekly', nextDue: '2026-11-20', anchorDay: 20 })]);
    expect(s.upcoming.slice(0, 3).map((i) => i.dueDate)).toEqual(['2026-11-20', '2026-11-27', '2026-12-04']);
    expect(s.leftThisMonthMinor).toBe(20000);
    expect(s.upcoming.at(-1)!.dueDate <= '2027-01-17').toBe(true);
  });

  it('ignores inactive subscriptions everywhere', () => {
    const off = sub({ active: false, nextDue: '2026-11-09', autoPay: false });
    const s = run([off], [pay({ subscriptionId: off.id, dueDate: '2026-10-09', paidAt: '2026-11-02T00:00:00Z' })]);
    expect(s.upcoming).toEqual([]);
    expect(s.overdue).toEqual([]);
    expect(s.paidThisMonth).toEqual([]);
    expect(s.monthlyAverageMinor).toBe(0);
  });

  it('matches paidThisMonth on due date, not paidAt', () => {
    const a = sub({ autoPay: false, anchorDay: 9, nextDue: '2026-12-09' });
    const s = run([a], [pay({ subscriptionId: a.id, dueDate: '2026-11-09', paidAt: '2026-10-31T22:30:00Z' })]);
    expect(s.paidThisMonth.map((p) => p.dueDate)).toEqual(['2026-11-09']);
  });

  it('totals a yen subscription in a dollar base', () => {
    const usd: Rates = { base: 'USD', date: today, stale: false, rates: { JPY: 0.0065 } };
    const s = computeSummary({ subs: [sub({ amountMinor: 1590, currency: 'JPY' }), sub({ amountMinor: 999, currency: 'USD' })], payments: [], today, rates: usd });
    // ¥1,590 × 0.0065 = $10.335 → 1034 cents.
    expect(s.upcoming[0]!.baseMinor).toBe(1034);
    expect(s.monthlyAverageMinor).toBe(1034 + 999);
    expect(s.leftThisMonthMinor).toBe(1034 + 999);
  });

  it('totals a dollar subscription in a yen base in whole yen', () => {
    const jpy: Rates = { base: 'JPY', date: today, stale: false, rates: { USD: 155 } };
    const s = computeSummary({ subs: [sub({ amountMinor: 2000, currency: 'USD' }), sub({ amountMinor: 1590, currency: 'JPY' })], payments: [], today, rates: jpy });
    expect(s.upcoming[0]!.baseMinor).toBe(3100);
    expect(s.monthlyAverageMinor).toBe(3100 + 1590);
    expect(s.yearlyTotalMinor).toBe((3100 + 1590) * 12);
  });
});
