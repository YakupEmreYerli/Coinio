import { count, eq, inArray } from 'drizzle-orm';
import { CATEGORY_LABELS } from '../../shared/catalog.js';
import { SAMPLE_SUBSCRIPTIONS, samplePrice } from '../../shared/sampleData.js';
import { settings, subscriptions, users } from '../db/schema.js';
import { todayIn } from '../../shared/schedule.js';
import type { ServiceCtx } from './context.js';
import { getSettings } from './settings.js';
import { createSubscription } from './subscriptions.js';

const DONE = 'onboarded';
const SAMPLES = 'sampleIds';

const read = (ctx: ServiceCtx, key: string) => ctx.db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null;
const write = (ctx: ServiceCtx, key: string, value: string) =>
  ctx.db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();

function sampleIds(ctx: ServiceCtx): number[] {
  try {
    const v = JSON.parse(read(ctx, SAMPLES) ?? '[]');
    return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

/**
 * Installs from before the wizard existed count as onboarded: they already have subscriptions
 * or an account older than a day.
 */
export function getOnboarding(ctx: ServiceCtx, userId: number): { completed: boolean; hasSamples: boolean } {
  let completed = read(ctx, DONE) === '1';
  if (!completed) {
    const subs = ctx.db.select({ n: count() }).from(subscriptions).where(eq(subscriptions.userId, userId)).get()?.n ?? 0;
    const user = ctx.db.select({ c: users.createdAt }).from(users).where(eq(users.id, userId)).get();
    const old = !!user && ctx.now().getTime() - Date.parse(user.c) > 86_400_000;
    completed = subs > 0 || old;
  }
  return { completed, hasSamples: sampleIds(ctx).length > 0 };
}

export function completeOnboarding(ctx: ServiceCtx): void {
  write(ctx, DONE, '1');
}

/** Adds the demo set once (no-op while samples exist), priced in USD and dated around today. */
export function createSamples(ctx: ServiceCtx, userId: number): number[] {
  const existing = sampleIds(ctx);
  if (existing.length) return existing;
  const { timezone, baseCurrency, locale } = getSettings(ctx);
  const today = todayIn(timezone, ctx.now());
  const at = (days: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const ids = SAMPLE_SUBSCRIPTIONS.map(
    (s) =>
      createSubscription(ctx, userId, {
        name: s.name,
        domain: s.domain,
        ...samplePrice(s.amountMinor, baseCurrency),
        cycle: s.cycle,
        intervalCount: 1,
        nextDue: at(s.dueIn),
        autoPay: s.autoPay,
        category: CATEGORY_LABELS[s.category][locale],
        paymentMethod: s.paymentMethod,
      }).id,
  );
  write(ctx, SAMPLES, JSON.stringify(ids));
  return ids;
}

/** Deletes only the demo subscriptions (and their payments); anything the user added stays. */
export function clearSamples(ctx: ServiceCtx, userId: number): void {
  const ids = sampleIds(ctx);
  if (ids.length) ctx.db.delete(subscriptions).where(inArray(subscriptions.id, ids)).run();
  write(ctx, SAMPLES, '[]');
  void userId;
}
