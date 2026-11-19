import { dueDatesThrough } from '../../shared/schedule';
import type { ApiPayment, ApiSubscription } from '../lib/types';

export type DayState = 'paid' | 'skipped' | 'overdue' | 'due' | 'projected';
export type DayItem = { subscriptionId: number; dueDate: string; state: DayState; baseMinor: number | null; paymentId?: number };
export type RateTable = { base: string; rates: Record<string, number> };

export function toBase(amountMinor: number, currency: string, rates: RateTable): number | null {
  if (currency === rates.base) return amountMinor;
  const rate = rates.rates[currency];
  return rate === undefined ? null : Math.round(amountMinor * rate);
}

/**
 * Payments of one month by day. Settled dates come from payment records; open ones from each active
 * subscription's next_due onward (the first open date is `due`, later ones `projected`, past manual ones `overdue`).
 */
export function projectMonth(
  subs: ApiSubscription[],
  payments: ApiPayment[],
  month: string,
  today: string,
  rates: RateTable,
): Record<string, DayItem[]> {
  const days: Record<string, DayItem[]> = {};
  const add = (item: DayItem) => (days[item.dueDate] ??= []).push(item);
  const settled = new Set<string>();

  for (const p of payments) {
    if (p.status === 'void') continue;
    settled.add(`${p.subscriptionId}|${p.dueDate}`);
    if (!p.dueDate.startsWith(month)) continue;
    const baseMinor = p.status === 'skipped' ? 0 : (p.actualBaseMinor ?? toBase(p.amountMinor, p.currency, rates));
    add({ subscriptionId: p.subscriptionId, dueDate: p.dueDate, state: p.status, baseMinor, paymentId: p.id });
  }

  // Day 31 is a safe string upper bound for any month.
  const until = `${month}-31`;
  for (const sub of subs) {
    if (!sub.active) continue;
    const baseMinor = toBase(sub.amountMinor, sub.currency, rates);
    let first = true;
    for (const due of dueDatesThrough(sub.nextDue, until, sub.cycle, sub.intervalCount, sub.anchorDay)) {
      if (settled.has(`${sub.id}|${due}`)) continue;
      const past = due < today;
      const state: DayState = past ? 'overdue' : first ? 'due' : 'projected';
      first = false;
      // A past auto-pay date without a record belongs to the auto-pay job.
      if (past && sub.autoPay) continue;
      if (due.startsWith(month)) add({ subscriptionId: sub.id, dueDate: due, state, baseMinor });
    }
  }

  const order = Object.keys(days).sort();
  return Object.fromEntries(order.map((d) => [d, days[d]!]));
}
