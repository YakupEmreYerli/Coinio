import { convertMinor as convertUnits } from '../../shared/money.js';

export type Rates = {
  base: string;
  date: string;
  stale: boolean;
  /** rates[X] = how many base units one X is worth (1 USD = 42.5 TRY -> rates.USD = 42.5). */
  rates: Record<string, number>;
};

/** Convert minor units of `from` into minor units of `rates.base`; null when no rate is known. */
export function convertMinor(amountMinor: number, from: string, rates: Rates): number | null {
  if (from === rates.base) return amountMinor;
  const rate = rates.rates[from];
  if (rate === undefined) return null;
  return convertUnits(amountMinor, from, rates.base, rate);
}
