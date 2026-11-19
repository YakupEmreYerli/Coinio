import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { fxRates } from '../db/schema.js';
import type { Rates } from '../domain/money.js';

const STALE_AFTER_DAYS = 4;

export type FetchFn = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

/**
 * Fetch "1 X = n base" for each currency and cache it as row (base, quote=X).
 * Never throws: a failed currency keeps its previous cached row.
 */
export async function refreshRates(
  db: Db,
  base: string,
  currencies: string[],
  fetchFn: FetchFn,
  today: string,
): Promise<void> {
  for (const cur of new Set(currencies)) {
    if (cur === base) continue;
    try {
      const res = await fetchFn(`https://api.frankfurter.dev/v1/latest?from=${cur}&to=${base}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { date?: string; rates?: Record<string, number> };
      const rate = body.rates?.[base];
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0 || typeof body.date !== 'string') {
        throw new Error('unexpected response shape');
      }
      db.insert(fxRates)
        .values({ base, quote: cur, rate, date: body.date, fetchedAt: today })
        .onConflictDoUpdate({
          target: [fxRates.base, fxRates.quote],
          set: { rate, date: body.date, fetchedAt: today },
        })
        .run();
    } catch (err) {
      console.warn(`fx: refresh ${cur}->${base} failed:`, err instanceof Error ? err.message : err);
    }
  }
}

/**
 * Cached rates for `base`. `stale` is judged on the last successful fetch (fetched_at),
 * not the rate date, because ECB does not publish on weekends. No cached rows counts as stale.
 */
export function getRates(db: Db, base: string, today: string): Rates {
  const rows = db.select().from(fxRates).where(eq(fxRates.base, base)).all();
  const rates: Record<string, number> = {};
  let date = '';
  let lastFetch = '';
  for (const r of rows) {
    rates[r.quote] = r.rate;
    if (r.date > date) date = r.date;
    if (r.fetchedAt > lastFetch) lastFetch = r.fetchedAt;
  }
  const stale = !lastFetch || dayNumber(today) - dayNumber(lastFetch) > STALE_AFTER_DAYS;
  return { base, date, stale, rates };
}
