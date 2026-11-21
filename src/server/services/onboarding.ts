import { and, count, eq, inArray } from 'drizzle-orm';
import { CATEGORY_LABELS } from '../../shared/catalog.js';
import { samplesFor, sampleWord } from '../../shared/sampleData.js';
import { subscriptions, users } from '../db/schema.js';
import { todayIn } from '../../shared/schedule.js';
import type { ServiceCtx } from './context.js';
import { getSettings, getUserValue, setUserValue } from './settings.js';
import { createSubscription } from './subscriptions.js';

function sampleIds(ctx: ServiceCtx, userId: number): number[] {
  try {
    const v = JSON.parse(getUserValue(ctx, userId, 'sampleIds') ?? '[]');
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
  let completed = getUserValue(ctx, userId, 'onboarded') === '1';
  if (!completed) {
    const subs = ctx.db.select({ n: count() }).from(subscriptions).where(eq(subscriptions.userId, userId)).get()?.n ?? 0;
    const user = ctx.db.select({ c: users.createdAt }).from(users).where(eq(users.id, userId)).get();
    const old = !!user && ctx.now().getTime() - Date.parse(user.c) > 86_400_000;
    completed = subs > 0 || old;
  }
  return { completed, hasSamples: sampleIds(ctx, userId).length > 0 };
}

export function completeOnboarding(ctx: ServiceCtx, userId: number): void {
  setUserValue(ctx, userId, 'onboarded', '1');
}

/** Adds the demo set once (no-op while samples exist), priced for the main currency and dated around today. */
export function createSamples(ctx: ServiceCtx, userId: number): number[] {
  const existing = sampleIds(ctx, userId);
  if (existing.length) return existing;
  const { timezone, baseCurrency, locale } = getSettings(ctx, userId);
  const today = todayIn(timezone, ctx.now());
  const at = (days: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const ids = samplesFor(locale, baseCurrency).map(
    (s) =>
      createSubscription(ctx, userId, {
        name: sampleWord(s.name, locale),
        domain: s.domain,
        amountMinor: s.amountMinor,
        currency: s.currency,
        cycle: s.cycle,
        intervalCount: 1,
        nextDue: at(s.dueIn),
        autoPay: s.autoPay,
        category: CATEGORY_LABELS[s.category][locale],
        paymentMethod: sampleWord(s.paymentMethod, locale),
      }).id,
  );
  setUserValue(ctx, userId, 'sampleIds', JSON.stringify(ids));
  return ids;
}

/** Deletes only the demo subscriptions (and their payments); anything the user added stays. */
export function clearSamples(ctx: ServiceCtx, userId: number): void {
  const ids = sampleIds(ctx, userId);
  if (ids.length) ctx.db.delete(subscriptions).where(and(eq(subscriptions.userId, userId), inArray(subscriptions.id, ids))).run();
  setUserValue(ctx, userId, 'sampleIds', '[]');
}
