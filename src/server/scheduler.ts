import { eq } from 'drizzle-orm';
import { subscriptions, users } from './db/schema.js';
import { todayIn } from '../shared/schedule.js';
import { runAutoPay } from './services/autopay.js';
import { getRates, refreshRates, type FetchFn } from './services/fx.js';
import { getInstanceValue, getSettings, setInstanceValue } from './services/settings.js';
import { runNotifications } from './services/notify/index.js';
import type { ServiceCtx } from './services/context.js';

// Currencies already tried today outside the daily refresh, so an offline API is not hit every minute.
const triedToday = new Set<string>();

/**
 * Refresh FX rates once per UTC day for every main currency in use and the currencies of active
 * subscriptions, and fetch a currency the same day it first appears instead of waiting for tomorrow.
 */
async function refreshRatesDaily(ctx: ServiceCtx): Promise<void> {
  const today = todayIn('UTC', ctx.now());
  const bases = [...new Set(ctx.db.select({ id: users.id }).from(users).all().map((u) => getSettings(ctx, u.id).baseCurrency))];
  const currencies = ctx.db
    .selectDistinct({ currency: subscriptions.currency })
    .from(subscriptions)
    .where(eq(subscriptions.active, true))
    .all()
    .map((r) => r.currency);
  const fresh = getInstanceValue(ctx, 'lastFxDate') !== today;
  for (const base of bases) {
    if (fresh) {
      await refreshRates(ctx.db, base, currencies, ctx.fetch as FetchFn, today);
      continue;
    }
    const cached = getRates(ctx.db, base, today).rates;
    const missing = currencies.filter((c) => c !== base && !(c in cached) && !triedToday.has(`${today}:${base}:${c}`));
    if (missing.length === 0) continue;
    missing.forEach((c) => triedToday.add(`${today}:${base}:${c}`));
    await refreshRates(ctx.db, base, missing, ctx.fetch as FetchFn, today);
  }
  if (fresh && bases.length > 0) setInstanceValue(ctx, 'lastFxDate', today);
}

/**
 * Runs once immediately, then every `intervalMs` (default 60s). A failing tick is logged, never thrown.
 * Returns a function that stops the timer.
 */
export function startScheduler(
  ctx: ServiceCtx,
  opts: { intervalMs?: number; onTick?: () => Promise<void> } = {},
): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    // Each step is isolated so one failing step never skips the others.
    const step = async (name: string, fn: () => unknown) => {
      try {
        await fn();
      } catch (err) {
        console.error(`scheduler ${name} failed:`, err);
      }
    };
    try {
      await step('autopay', () => runAutoPay(ctx));
      await step('fx refresh', () => refreshRatesDaily(ctx));
      await step('notifications', () => runNotifications(ctx));
      await step('onTick', async () => opts.onTick?.());
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), opts.intervalMs ?? 60_000);
  return () => clearInterval(timer);
}
