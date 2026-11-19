import { eq } from 'drizzle-orm';
import { subscriptions } from './db/schema.js';
import { todayIn } from '../shared/schedule.js';
import { runAutoPay } from './services/autopay.js';
import { getRates, refreshRates, type FetchFn } from './services/fx.js';
import { getInternalValue, getSettings, setInternalValue } from './services/settings.js';
import { sendDueReminders } from './services/telegram.js';
import type { ServiceCtx } from './services/context.js';

// Currencies already tried today outside the daily refresh, so an offline API is not hit every minute.
const triedToday = new Set<string>();

/**
 * Refresh FX rates for the currencies of active subscriptions once per local day, and fetch a
 * currency the same day it first appears (a new foreign subscription) instead of waiting for tomorrow.
 */
async function refreshRatesDaily(ctx: ServiceCtx): Promise<void> {
  const { timezone, baseCurrency } = getSettings(ctx);
  const today = todayIn(timezone, ctx.now());
  const currencies = ctx.db
    .selectDistinct({ currency: subscriptions.currency })
    .from(subscriptions)
    .where(eq(subscriptions.active, true))
    .all()
    .map((r) => r.currency);
  if (getInternalValue(ctx, 'lastFxDate') === today) {
    const cached = getRates(ctx.db, baseCurrency, today).rates;
    const missing = currencies.filter((c) => c !== baseCurrency && !(c in cached) && !triedToday.has(`${today}:${baseCurrency}:${c}`));
    if (missing.length === 0) return;
    missing.forEach((c) => triedToday.add(`${today}:${baseCurrency}:${c}`));
    await refreshRates(ctx.db, baseCurrency, missing, ctx.fetch as FetchFn, today);
    return;
  }
  await refreshRates(ctx.db, baseCurrency, currencies, ctx.fetch as FetchFn, today);
  setInternalValue(ctx, 'lastFxDate', today);
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
      await step('telegram reminders', () => sendDueReminders(ctx));
      await step('onTick', async () => opts.onTick?.());
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), opts.intervalMs ?? 60_000);
  return () => clearInterval(timer);
}
