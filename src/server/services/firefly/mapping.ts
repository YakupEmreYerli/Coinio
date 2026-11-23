// Pure field mapping between Coinio subscriptions and Firefly bills.
import type { SubscriptionRow } from '../../domain/summary.js';
import { decimalToMinor, minorToDecimal } from '../../../shared/money.js';
import { nextDue, type Cycle } from '../../../shared/schedule.js';
import type { FfBill, FfBillWrite } from './client.js';

/** The fields both sides share; their hash tells which side changed since the last sync. */
export type Mapped = {
  name: string; amountMinor: number; variable: boolean; currency: string; cycle: Cycle; intervalCount: number;
  active: boolean; notes: string | null;
};

export function toFireflyFreq(cycle: Cycle, n: number): { repeat_freq: FfBill['repeatFreq']; skip: number } {
  if (cycle === 'monthly' && n === 3) return { repeat_freq: 'quarterly', skip: 0 };
  if (cycle === 'monthly' && n === 6) return { repeat_freq: 'half-year', skip: 0 };
  return { repeat_freq: cycle, skip: n - 1 };
}

export function fromFireflyFreq(freq: FfBill['repeatFreq'], skip: number): { cycle: Cycle; intervalCount: number } {
  if (freq === 'quarterly') return { cycle: 'monthly', intervalCount: 3 * (skip + 1) };
  if (freq === 'half-year') return { cycle: 'monthly', intervalCount: 6 * (skip + 1) };
  return { cycle: freq, intervalCount: skip + 1 };
}

function toMinor(amount: string, currency: string): number {
  const minor = decimalToMinor(Number(amount), currency);
  if (minor === null || !Number.isFinite(minor)) throw new Error('bad amount');
  return minor;
}

export function mappedFromSubscription(s: SubscriptionRow): Mapped {
  const f = toFireflyFreq(s.cycle, s.intervalCount);
  return {
    name: s.name, amountMinor: s.amountMinor, variable: s.variableAmount, currency: s.currency,
    ...fromFireflyFreq(f.repeat_freq, f.skip), active: s.active, notes: s.notes,
  };
}

export function mappedFromBill(b: FfBill): Mapped {
  return {
    name: b.name, amountMinor: toMinor(b.amountMax, b.currencyCode), variable: b.amountMin !== b.amountMax,
    currency: b.currencyCode, ...fromFireflyFreq(b.repeatFreq, b.skip), active: b.active, notes: b.notes,
  };
}

export function hashMapped(m: Mapped): string {
  return JSON.stringify([
    m.name.trim(), m.amountMinor, m.variable, m.currency, m.cycle, m.intervalCount, m.active, m.notes || null,
  ]);
}

export function billWrite(s: SubscriptionRow, existing: FfBill | null, opts: { withDate: boolean }): Partial<FfBillWrite> {
  const amountMax = minorToDecimal(s.amountMinor, s.currency);
  return {
    name: s.name, amount_min: s.variableAmount && existing ? existing.amountMin : amountMax, amount_max: amountMax,
    currency_code: s.currency, ...(opts.withDate ? { date: s.nextDue } : {}), ...toFireflyFreq(s.cycle, s.intervalCount),
    active: s.active, notes: s.notes,
  };
}

export function subscriptionPatch(b: FfBill): Record<string, unknown> {
  const m = mappedFromBill(b);
  return {
    name: m.name, amountMinor: m.amountMinor, currency: m.currency, variableAmount: m.variable, cycle: m.cycle,
    intervalCount: m.intervalCount, active: m.active, notes: m.notes,
  };
}

export function subscriptionInput(b: FfBill, today: string): Record<string, unknown> {
  const { cycle, intervalCount } = fromFireflyFreq(b.repeatFreq, b.skip);
  let due = b.nextExpectedMatch?.slice(0, 10);
  if (!due) {
    const start = b.date.slice(0, 10);
    const anchor = Number(start.slice(8, 10));
    for (due = start; due < today; due = nextDue(due, cycle, intervalCount, anchor));
  }
  return { ...subscriptionPatch(b), nextDue: due, autoPay: false };
}

export function sameName(a: string, b: string): boolean {
  const norm = (s: string) => s.toLocaleLowerCase('en').replace(/\s+/g, '');
  return norm(a) === norm(b);
}
