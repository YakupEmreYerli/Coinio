import type { ApiSubscription } from './types';

/** Converts with the summary's rates (base units per 1 unit of the currency); null if no rate. */
export function toBaseMinor(amountMinor: number, currency: string, base: string, rates: Record<string, number> | undefined): number | null {
  if (currency === base) return amountMinor;
  const r = rates?.[currency];
  return r ? Math.round(amountMinor * r) : null;
}

const perYear = (s: ApiSubscription) => (s.cycle === 'weekly' ? 52 : s.cycle === 'monthly' ? 12 : 1) / s.intervalCount;

/** Average monthly cost of a subscription in the base currency (yearly ÷ 12, weekly × 52 ÷ 12). */
export function monthlyCost(s: ApiSubscription, base: string, rates: Record<string, number> | undefined): number | null {
  const b = toBaseMinor(s.amountMinor, s.currency, base, rates);
  return b === null ? null : Math.round((b * perYear(s)) / 12);
}
