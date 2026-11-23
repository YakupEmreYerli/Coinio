import { and, count, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { PaymentPatch, type PaymentQuery, SubscriptionInput, SubscriptionPatch } from '../../shared/types.js';
import { payments, subscriptions } from '../db/schema.js';
import { dueDatesThrough, nextDue, todayIn } from '../../shared/schedule.js';
import { computeSummary, type PaymentRow, type PaymentSource, type Summary, type SubscriptionRow } from '../domain/summary.js';
import type { ServiceCtx } from './context.js';
import { getRates } from './fx.js';
import { fetchLogoInBackground } from './logos.js';
import { NotFoundError, checkLimit } from './errors.js';
import { notifyPriceChange } from './notify/index.js';
import { getSettings } from './settings.js';

export { NotFoundError } from './errors.js';

const dayOf = (date: string) => Number(date.slice(8, 10));

export function listSubscriptions(
  ctx: ServiceCtx,
  userId: number,
  opts: { includeInactive?: boolean } = {},
): SubscriptionRow[] {
  const where = opts.includeInactive
    ? eq(subscriptions.userId, userId)
    : and(eq(subscriptions.userId, userId), eq(subscriptions.active, true));
  return ctx.db.select().from(subscriptions).where(where).orderBy(subscriptions.nextDue, subscriptions.id).all();
}

export function getSubscription(ctx: ServiceCtx, userId: number, id: number): SubscriptionRow {
  const row = ctx.db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, userId)))
    .get();
  if (!row) throw new NotFoundError('subscription');
  return row;
}

/** Validates and inserts without starting the background logo fetch (for callers inside a transaction). */
export function insertSubscription(ctx: ServiceCtx, userId: number, input: unknown): SubscriptionRow {
  const v = SubscriptionInput.parse(input);
  const owned = ctx.db.select({ n: count() }).from(subscriptions).where(eq(subscriptions.userId, userId)).get()?.n ?? 0;
  checkLimit('subscriptions', ctx.config.limits.maxSubscriptions, owned);
  const stamp = ctx.now().toISOString();
  return ctx.db
    .insert(subscriptions)
    .values({
      userId,
      name: v.name,
      domain: v.domain ?? null,
      amountMinor: v.amountMinor,
      currency: v.currency,
      variableAmount: v.variableAmount,
      cycle: v.cycle,
      intervalCount: v.intervalCount,
      anchorDay: dayOf(v.nextDue),
      nextDue: v.nextDue,
      autoPay: v.autoPay,
      paymentMethod: v.paymentMethod ?? null,
      category: v.category ?? null,
      notes: v.notes ?? null,
      reminderOffsets: v.reminderOffsets,
      trialEndsAt: v.trialEndsAt,
      createdAt: stamp,
      updatedAt: stamp,
    })
    .returning()
    .get();
}

export function createSubscription(ctx: ServiceCtx, userId: number, input: unknown): SubscriptionRow {
  const row = insertSubscription(ctx, userId, input);
  if (row.domain) fetchLogoInBackground(ctx, row.id, row.domain);
  return row;
}

export function updateSubscription(ctx: ServiceCtx, userId: number, id: number, patch: unknown): SubscriptionRow {
  const v = SubscriptionPatch.parse(patch);
  const before = getSubscription(ctx, userId, id);
  const set: Partial<typeof subscriptions.$inferInsert> = { updatedAt: ctx.now().toISOString() };
  if (v.name !== undefined) set.name = v.name;
  if (v.domain !== undefined) set.domain = v.domain;
  if (v.amountMinor !== undefined) set.amountMinor = v.amountMinor;
  if (v.currency !== undefined) set.currency = v.currency;
  if (v.variableAmount !== undefined) set.variableAmount = v.variableAmount;
  if (v.cycle !== undefined) set.cycle = v.cycle;
  if (v.intervalCount !== undefined) set.intervalCount = v.intervalCount;
  if (v.nextDue !== undefined) {
    set.nextDue = v.nextDue;
    set.anchorDay = dayOf(v.nextDue);
  }
  if (v.autoPay !== undefined) set.autoPay = v.autoPay;
  if (v.paymentMethod !== undefined) set.paymentMethod = v.paymentMethod;
  if (v.category !== undefined) set.category = v.category;
  if (v.notes !== undefined) set.notes = v.notes;
  if (v.reminderOffsets !== undefined) set.reminderOffsets = v.reminderOffsets;
  if (v.trialEndsAt !== undefined) set.trialEndsAt = v.trialEndsAt;
  if (v.active !== undefined) set.active = v.active;
  // Resuming never brings back the periods missed while paused.
  // The edit form sends the unchanged nextDue back, so an unchanged value counts as "not given".
  if (v.active === true && !before.active && (v.nextDue === undefined || v.nextDue === before.nextDue)) {
    const today = todayIn(getSettings(ctx, userId).timezone, ctx.now());
    if (before.nextDue < today) {
      const cycle = set.cycle ?? before.cycle;
      const count = set.intervalCount ?? before.intervalCount;
      const past = dueDatesThrough(before.nextDue, today, cycle, count, before.anchorDay);
      const last = past[past.length - 1]!;
      set.nextDue = last === today ? today : nextDue(last, cycle, count, before.anchorDay);
    }
  }
  const row = ctx.db.update(subscriptions).set(set).where(eq(subscriptions.id, id)).returning().get();
  if (row.domain && row.domain !== before.domain) fetchLogoInBackground(ctx, row.id, row.domain);
  if (row.amountMinor !== before.amountMinor) notifyPriceChange(ctx, row, before.amountMinor, row.amountMinor, null);
  return row;
}

export function deleteSubscription(ctx: ServiceCtx, userId: number, id: number): void {
  getSubscription(ctx, userId, id);
  ctx.db.delete(subscriptions).where(eq(subscriptions.id, id)).run();
}

export function listPayments(ctx: ServiceCtx, userId: number, filter: PaymentQuery = {}): PaymentRow[] {
  const conds = [eq(subscriptions.userId, userId)];
  if (filter.subscriptionId !== undefined) conds.push(eq(payments.subscriptionId, filter.subscriptionId));
  if (filter.from !== undefined) conds.push(gte(payments.dueDate, filter.from));
  if (filter.to !== undefined) conds.push(lte(payments.dueDate, filter.to));
  if (filter.source !== undefined) conds.push(eq(payments.source, filter.source));
  if (filter.status !== undefined) conds.push(eq(payments.status, filter.status));
  return ctx.db
    .select({ p: payments })
    .from(payments)
    .innerJoin(subscriptions, eq(payments.subscriptionId, subscriptions.id))
    .where(and(...conds))
    .orderBy(desc(payments.dueDate), desc(payments.id))
    .all()
    .map((r) => r.p);
}

function getOwnedPayment(ctx: ServiceCtx, userId: number, paymentId: number): PaymentRow {
  const row = ctx.db
    .select({ p: payments })
    .from(payments)
    .innerJoin(subscriptions, eq(payments.subscriptionId, subscriptions.id))
    .where(and(eq(payments.id, paymentId), eq(subscriptions.userId, userId)))
    .get();
  if (!row) throw new NotFoundError('payment');
  return row.p;
}

/** The cycle after next_due, stepping over dates already settled (paid or skipped ahead of time). */
function nextOpenDue(db: ServiceCtx['db'], sub: SubscriptionRow): string {
  let d = nextDue(sub.nextDue, sub.cycle, sub.intervalCount, sub.anchorDay);
  for (let guard = 0; guard < 500; guard++) {
    const taken = db
      .select({ s: payments.status })
      .from(payments)
      .where(and(eq(payments.subscriptionId, sub.id), eq(payments.dueDate, d)))
      .get();
    if (!taken || taken.s === 'void') break;
    d = nextDue(d, sub.cycle, sub.intervalCount, sub.anchorDay);
  }
  return d;
}

export function markPaid(
  ctx: ServiceCtx,
  userId: number,
  id: number,
  opts: { dueDate?: string; actualBaseMinor?: number; amountMinor?: number; currency?: string; paidAt?: string; source?: PaymentSource; now: Date },
): PaymentRow {
  const changed: { sub?: SubscriptionRow; dueDate?: string } = {};
  const result = ctx.db.transaction((tx) => {
    const sub = getSubscription({ ...ctx, db: tx as typeof ctx.db }, userId, id);
    const dueDate = opts.dueDate ?? sub.nextDue;
    const existing = tx
      .select()
      .from(payments)
      .where(and(eq(payments.subscriptionId, id), eq(payments.dueDate, dueDate)))
      .get();
    if (existing?.status === 'paid') return existing;

    const values = {
      paidAt: opts.paidAt ?? opts.now.toISOString(),
      amountMinor: opts.amountMinor ?? sub.amountMinor,
      currency: opts.currency ?? sub.currency,
      actualBaseMinor: opts.actualBaseMinor ?? null,
      status: 'paid' as const,
    };
    // A flipped void payment keeps its original source.
    const payment = existing
      ? tx.update(payments).set(values).where(eq(payments.id, existing.id)).returning().get()
      : tx.insert(payments).values({ subscriptionId: id, dueDate, source: opts.source ?? 'manual', ...values }).returning().get();

    if (dueDate === sub.nextDue) {
      tx.update(subscriptions)
        .set({ nextDue: nextOpenDue(tx as typeof ctx.db, sub), updatedAt: opts.now.toISOString() })
        .where(eq(subscriptions.id, id))
        .run();
    }
    // Variable bills differ every time by design; only a fixed amount that changed is news.
    if (!sub.variableAmount && payment.amountMinor !== sub.amountMinor) Object.assign(changed, { sub, dueDate });
    return payment;
  });
  if (changed.sub) notifyPriceChange(ctx, changed.sub, changed.sub.amountMinor, result.amountMinor, changed.dueDate ?? null);
  return result;
}

/** Records the due date as skipped (counts as nothing) and advances next_due like a payment would. */
export function skipPayment(ctx: ServiceCtx, userId: number, id: number, opts: { dueDate?: string; now: Date }): PaymentRow {
  return ctx.db.transaction((tx) => {
    const sub = getSubscription({ ...ctx, db: tx as typeof ctx.db }, userId, id);
    const dueDate = opts.dueDate ?? sub.nextDue;
    const existing = tx
      .select()
      .from(payments)
      .where(and(eq(payments.subscriptionId, id), eq(payments.dueDate, dueDate)))
      .get();
    if (existing && existing.status !== 'void') return existing;
    const values = { paidAt: opts.now.toISOString(), amountMinor: 0, currency: sub.currency, actualBaseMinor: null, status: 'skipped' as const, source: 'manual' as const };
    const payment = existing
      ? tx.update(payments).set(values).where(eq(payments.id, existing.id)).returning().get()
      : tx.insert(payments).values({ subscriptionId: id, dueDate, ...values }).returning().get();
    if (dueDate === sub.nextDue) {
      tx.update(subscriptions)
        .set({ nextDue: nextOpenDue(tx as typeof ctx.db, sub), updatedAt: opts.now.toISOString() })
        .where(eq(subscriptions.id, id))
        .run();
    }
    return payment;
  });
}

/**
 * Manual payment: delete it and, if it was the latest due date, roll next_due back.
 * Auto payment: keep the row as 'void' and leave next_due alone, otherwise autopay would reopen it.
 */
export function undoPayment(ctx: ServiceCtx, userId: number, paymentId: number): void {
  ctx.db.transaction((tx) => {
    const txCtx = { ...ctx, db: tx as typeof ctx.db };
    const payment = getOwnedPayment(txCtx, userId, paymentId);
    if (payment.source === 'auto') {
      tx.update(payments).set({ status: 'void' }).where(eq(payments.id, paymentId)).run();
      return;
    }
    tx.delete(payments).where(eq(payments.id, paymentId)).run();
    const sub = getSubscription(txCtx, userId, payment.subscriptionId);
    const latest = tx
      .select({ d: payments.dueDate })
      .from(payments)
      .where(eq(payments.subscriptionId, sub.id))
      .orderBy(desc(payments.dueDate))
      .get();
    if (payment.dueDate < sub.nextDue && (!latest || latest.d < payment.dueDate)) {
      tx.update(subscriptions)
        .set({ nextDue: payment.dueDate, updatedAt: ctx.now().toISOString() })
        .where(eq(subscriptions.id, sub.id))
        .run();
    }
  });
}

export function updatePayment(ctx: ServiceCtx, userId: number, paymentId: number, patch: unknown): PaymentRow {
  const v = PaymentPatch.parse(patch);
  getOwnedPayment(ctx, userId, paymentId);
  const set: Partial<typeof payments.$inferInsert> = {};
  if (v.amountMinor !== undefined) set.amountMinor = v.amountMinor;
  if (v.actualBaseMinor !== undefined) set.actualBaseMinor = v.actualBaseMinor;
  if (v.status !== undefined) set.status = v.status;
  if (Object.keys(set).length === 0) return getOwnedPayment(ctx, userId, paymentId);
  return ctx.db.update(payments).set(set).where(eq(payments.id, paymentId)).returning().get();
}

export function getSummary(ctx: ServiceCtx, userId: number, now: Date): Summary {
  const s = getSettings(ctx, userId);
  const today = todayIn(s.timezone, now);
  const subs = listSubscriptions(ctx, userId, { includeInactive: true });
  const ids = subs.map((x) => x.id);
  const pays = ids.length ? ctx.db.select().from(payments).where(inArray(payments.subscriptionId, ids)).all() : [];
  return computeSummary({ subs, payments: pays, today, rates: getRates(ctx.db, s.baseCurrency, today) });
}
