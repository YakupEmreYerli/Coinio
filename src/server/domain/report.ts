import { convertMinor, type Rates } from './money.js';
import { dueDatesThrough } from '../../shared/schedule.js';
import { perYear, type PaymentRow, type SubscriptionRow } from './summary.js';

export type Report = {
  base: string;
  months: { month: string; paidMinor: number; projectedMinor: number }[];
  byCategory: { category: string | null; monthlyMinor: number }[];
  top: { subscriptionId: number; name: string; monthlyMinor: number }[];
  foreignShare: { minor: number; percent: number };
  /** Active subscriptions left out of every figure because their currency has no rate. */
  unconvertible: number[];
  ratesStale: boolean;
};

const MONTHS_EACH_SIDE = 12;
const TOP_COUNT = 5;

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const index = y * 12 + (m - 1) + by;
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/**
 * Past 12 months, the current one and the next 12. Past months come from paid payments,
 * future months from projecting active subscriptions; the current month has both.
 */
export function computeReport(input: { subs: SubscriptionRow[]; payments: PaymentRow[]; today: string; rates: Rates }): Report {
  const { subs, payments: pays, today, rates } = input;
  const current = today.slice(0, 7);

  const months = Array.from({ length: 2 * MONTHS_EACH_SIDE + 1 }, (_, i) => ({
    month: shiftMonth(current, i - MONTHS_EACH_SIDE),
    paidMinor: 0,
    projectedMinor: 0,
  }));
  const byMonth = new Map(months.map((m) => [m.month, m]));

  for (const p of pays) {
    if (p.status !== 'paid') continue;
    const bucket = byMonth.get(p.dueDate.slice(0, 7));
    const base = p.actualBaseMinor ?? convertMinor(p.amountMinor, p.currency, rates);
    if (bucket && base !== null) bucket.paidMinor += base;
  }

  // Paid and skipped due dates are settled and never projected again.
  const settled = new Set(pays.filter((p) => p.status !== 'void').map((p) => `${p.subscriptionId}|${p.dueDate}`));
  // Day 31 is a safe string upper bound for any month.
  const until = `${months[months.length - 1]!.month}-31`;

  const categories = new Map<string | null, number>();
  const monthly: Report['top'] = [];
  let foreignMinor = 0;
  const unconvertible: number[] = [];
  let needsConversion = false;
  let totalMinor = 0;

  for (const sub of subs) {
    if (!sub.active) continue;
    if (sub.currency !== rates.base) needsConversion = true;
    const base = convertMinor(sub.amountMinor, sub.currency, rates);
    if (base === null) {
      unconvertible.push(sub.id);
      continue;
    }

    for (const due of dueDatesThrough(sub.nextDue, until, sub.cycle, sub.intervalCount, sub.anchorDay)) {
      if (due.slice(0, 7) < current || settled.has(`${sub.id}|${due}`)) continue;
      byMonth.get(due.slice(0, 7))!.projectedMinor += base;
    }

    const monthlyMinor = Math.round((base * perYear(sub)) / 12);
    categories.set(sub.category, (categories.get(sub.category) ?? 0) + monthlyMinor);
    monthly.push({ subscriptionId: sub.id, name: sub.name, monthlyMinor });
    totalMinor += monthlyMinor;
    if (sub.currency !== rates.base) foreignMinor += monthlyMinor;
  }

  const byMinorDesc = (a: { monthlyMinor: number }, b: { monthlyMinor: number }) => b.monthlyMinor - a.monthlyMinor;
  return {
    base: rates.base,
    months,
    byCategory: [...categories].map(([category, monthlyMinor]) => ({ category, monthlyMinor })).sort(byMinorDesc),
    top: monthly.sort(byMinorDesc).slice(0, TOP_COUNT),
    foreignShare: {
      minor: foreignMinor,
      percent: totalMinor ? Math.round((foreignMinor / totalMinor) * 1000) / 10 : 0,
    },
    unconvertible,
    ratesStale: needsConversion && rates.stale,
  };
}
