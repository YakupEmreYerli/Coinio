import type { InferSelectModel } from 'drizzle-orm';
import type { payments, subscriptions } from '../db/schema.js';
import { convertMinor, type Rates } from './money.js';
import { dueDatesThrough } from '../../shared/schedule.js';

export type SubscriptionRow = InferSelectModel<typeof subscriptions>;
export type PaymentRow = InferSelectModel<typeof payments>;
export type PaymentSource = 'manual' | 'auto' | 'firefly';

export type DueItem = {
  subscriptionId: number;
  name: string;
  logoPath: string | null;
  dueDate: string;
  daysLeft: number;
  amountMinor: number;
  currency: string;
  baseMinor: number | null;
  autoPay: boolean;
  variableAmount: boolean;
};

export type PaidItem = {
  paymentId: number;
  subscriptionId: number;
  name: string;
  dueDate: string;
  paidAt: string;
  amountMinor: number;
  currency: string;
  baseMinor: number | null;
  source: PaymentSource;
};

export type Summary = {
  base: string;
  leftThisMonthMinor: number;
  monthlyAverageMinor: number;
  yearlyTotalMinor: number;
  upcoming: DueItem[];
  overdue: DueItem[];
  paidThisMonth: PaidItem[];
  unconvertible: number[];
  ratesStale: boolean;
  /** rates[X] = base units per one X, for showing and converting foreign amounts on the client. */
  rates: Record<string, number>;
};

const UPCOMING_DAYS = 60;

function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

function addDays(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * 86_400_000).toISOString().slice(0, 10);
}

/** Occurrences per year of one subscription. */
export function perYear(sub: SubscriptionRow): number {
  const cycles = sub.cycle === 'weekly' ? 52 : sub.cycle === 'monthly' ? 12 : 1;
  return cycles / sub.intervalCount;
}

export function computeSummary(input: {
  subs: SubscriptionRow[];
  payments: PaymentRow[];
  today: string;
  rates: Rates;
}): Summary {
  const { today, rates } = input;
  const month = today.slice(0, 7);
  const horizon = addDays(today, UPCOMING_DAYS);
  const paid = input.payments.filter((p) => p.status === 'paid');
  // Skipped due dates are settled too: they never show as upcoming or overdue.
  const paidKeys = new Set(
    input.payments.filter((p) => p.status !== 'void').map((p) => `${p.subscriptionId}|${p.dueDate}`),
  );
  const active = input.subs.filter((s) => s.active);
  const byId = new Map(active.map((s) => [s.id, s]));

  const upcoming: DueItem[] = [];
  const overdue: DueItem[] = [];
  const unconvertible: number[] = [];
  let monthlyAverageMinor = 0;
  let yearlyTotalMinor = 0;
  let needsConversion = false;

  for (const sub of active) {
    const baseMinor = convertMinor(sub.amountMinor, sub.currency, rates);
    if (sub.currency !== rates.base) needsConversion = true;
    if (baseMinor === null) unconvertible.push(sub.id);
    else {
      const yearly = baseMinor * perYear(sub);
      yearlyTotalMinor += Math.round(yearly);
      monthlyAverageMinor += Math.round(yearly / 12);
    }

    const item = (dueDate: string): DueItem => ({
      subscriptionId: sub.id,
      name: sub.name,
      logoPath: sub.logoPath,
      dueDate,
      daysLeft: dayNumber(dueDate) - dayNumber(today),
      amountMinor: sub.amountMinor,
      currency: sub.currency,
      baseMinor,
      autoPay: sub.autoPay,
      variableAmount: sub.variableAmount,
    });

    for (const due of dueDatesThrough(sub.nextDue, horizon, sub.cycle, sub.intervalCount, sub.anchorDay)) {
      if (paidKeys.has(`${sub.id}|${due}`)) continue;
      if (due >= today) upcoming.push(item(due));
      else if (!sub.autoPay) overdue.push(item(due));
    }
  }

  const byDate = (a: DueItem, b: DueItem) =>
    a.dueDate.localeCompare(b.dueDate) || a.subscriptionId - b.subscriptionId;
  upcoming.sort(byDate);
  overdue.sort(byDate);

  const dueThisMonth = upcoming.filter((i) => i.dueDate.startsWith(month));
  const leftThisMonthMinor = [...overdue, ...dueThisMonth].reduce((sum, i) => sum + (i.baseMinor ?? 0), 0);

  const paidThisMonth: PaidItem[] = paid
    .filter((p) => byId.has(p.subscriptionId) && p.dueDate.startsWith(month))
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
    .map((p) => ({
      paymentId: p.id,
      subscriptionId: p.subscriptionId,
      name: byId.get(p.subscriptionId)!.name,
      dueDate: p.dueDate,
      paidAt: p.paidAt,
      amountMinor: p.amountMinor,
      currency: p.currency,
      baseMinor: p.actualBaseMinor ?? convertMinor(p.amountMinor, p.currency, rates),
      source: p.source,
    }));

  return {
    base: rates.base,
    leftThisMonthMinor,
    monthlyAverageMinor,
    yearlyTotalMinor,
    upcoming,
    overdue,
    paidThisMonth,
    unconvertible,
    ratesStale: needsConversion && rates.stale,
    rates: rates.rates,
  };
}
