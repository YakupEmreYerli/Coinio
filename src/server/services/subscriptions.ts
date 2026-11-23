import { and, count, desc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { PaymentPatch, type FamilyScope, type PaymentQuery, SubscriptionInput, SubscriptionPatch } from '../../shared/types.js';
import { payments, subscriptionSplits, subscriptions } from '../db/schema.js';
import { dueDatesThrough, nextDue, todayIn } from '../../shared/schedule.js';
import { resolveSplits, validateSplits } from '../domain/family.js';
import { computeSummary, type PaymentRow, type PaymentSource, type Summary, type SubscriptionRow } from '../domain/summary.js';
import type { ServiceCtx } from './context.js';
import { getRates } from './fx.js';
import { getHouseholdContext, type HouseholdContext } from './family.js';
import { fetchLogoInBackground } from './logos.js';
import { BadRequestError, ForbiddenError, NotFoundError, checkLimit } from './errors.js';
import { notifyPriceChange } from './notify/index.js';
import { getSettings } from './settings.js';

export { NotFoundError } from './errors.js';

export type SubscriptionSplitView = {
  memberId: number;
  shareMinor: number | null;
  effectiveMinor: number;
};

export type SubscriptionView = SubscriptionRow & {
  splits: SubscriptionSplitView[];
  myShareMinor: number;
  canEdit: boolean;
};

const dayOf = (date: string) => Number(date.slice(8, 10));

function enrichSubscriptions(
  db: ServiceCtx['db'],
  userId: number,
  rows: SubscriptionRow[],
  hh: HouseholdContext | null,
): SubscriptionView[] {
  if (rows.length === 0) return [];
  const sharedIds = rows.filter((r) => r.householdId !== null).map((r) => r.id);
  const splitsBySub = new Map<number, { memberId: number; shareMinor: number | null }[]>();
  if (sharedIds.length > 0) {
    for (const sp of db.select().from(subscriptionSplits).where(inArray(subscriptionSplits.subscriptionId, sharedIds)).all()) {
      const list = splitsBySub.get(sp.subscriptionId) ?? [];
      list.push({ memberId: sp.memberId, shareMinor: sp.shareMinor });
      splitsBySub.set(sp.subscriptionId, list);
    }
  }
  const allMemberIds = hh ? hh.members.map((m) => m.id) : [];

  return rows.map((row) => {
    const isShared = row.householdId !== null && hh !== null && row.householdId === hh.household.id;
    const canEdit = row.userId === userId || (isShared && hh!.me.role === 'owner');
    if (!isShared) {
      return { ...row, splits: [], myShareMinor: row.amountMinor, canEdit };
    }
    const rawSplits = splitsBySub.get(row.id) ?? [];
    const rawMap = new Map(rawSplits.map((s) => [s.memberId, s.shareMinor]));
    const resolved = resolveSplits(row.amountMinor, rawSplits, allMemberIds);
    const splits: SubscriptionSplitView[] = [...resolved.entries()].map(([memberId, effectiveMinor]) => ({
      memberId,
      shareMinor: rawMap.get(memberId) ?? null,
      effectiveMinor,
    }));
    const myShareMinor = resolved.get(hh!.me.id) ?? 0;
    return { ...row, splits, myShareMinor, canEdit };
  });
}

export function listSubscriptions(
  ctx: ServiceCtx,
  userId: number,
  opts: { includeInactive?: boolean; scope?: FamilyScope; memberId?: number } = {},
): SubscriptionView[] {
  const hh = getHouseholdContext(ctx.db, userId);
  let accessCond;
  if (!hh) {
    accessCond = eq(subscriptions.userId, userId);
  } else if (opts.scope === 'family') {
    accessCond = eq(subscriptions.householdId, hh.household.id);
  } else {
    accessCond = or(
      and(eq(subscriptions.userId, userId), isNull(subscriptions.householdId)),
      eq(subscriptions.householdId, hh.household.id),
    );
  }
  const where = opts.includeInactive ? accessCond : and(accessCond, eq(subscriptions.active, true));
  const rows = ctx.db.select().from(subscriptions).where(where).orderBy(subscriptions.nextDue, subscriptions.id).all();
  const enriched = enrichSubscriptions(ctx.db, userId, rows, hh);
  if (hh && opts.scope === 'family' && opts.memberId !== undefined) {
    const targetId = opts.memberId;
    return enriched.filter((s) => s.paidByMemberId === targetId || s.splits.some((sp) => sp.memberId === targetId));
  }
  return enriched;
}

export function getSubscription(ctx: ServiceCtx, userId: number, id: number): SubscriptionView {
  const row = ctx.db.select().from(subscriptions).where(eq(subscriptions.id, id)).get();
  if (!row) throw new NotFoundError('subscription');
  const hh = getHouseholdContext(ctx.db, userId);
  const accessible = row.userId === userId || (row.householdId !== null && row.householdId === hh?.household.id);
  if (!accessible) throw new NotFoundError('subscription');
  return enrichSubscriptions(ctx.db, userId, [row], hh)[0]!;
}

/** Validates payer + splits against `hh`, returning normalized rows for `subscription_splits`. */
function validateFamilyFields(
  hh: HouseholdContext | null,
  amountMinor: number,
  paidByMemberId: number | null | undefined,
  splits: ReadonlyArray<{ memberId: number; shareMinor?: number | null }> | undefined,
): { paidByMemberId: number | null; normalizedSplits: { memberId: number; shareMinor: number | null }[] | undefined } {
  if (!hh) throw new BadRequestError('family_required');
  const memberIds = new Set(hh.members.map((m) => m.id));
  if (paidByMemberId !== undefined && paidByMemberId !== null && !memberIds.has(paidByMemberId)) {
    throw new BadRequestError('invalid_member');
  }
  let normalizedSplits: { memberId: number; shareMinor: number | null }[] | undefined;
  if (splits !== undefined) {
    const check = validateSplits(amountMinor, splits, memberIds);
    if (!check.ok) throw new BadRequestError(check.error);
    normalizedSplits = splits.map((s) => ({ memberId: s.memberId, shareMinor: s.shareMinor ?? null }));
  }
  return {
    paidByMemberId: paidByMemberId === undefined ? hh.me.id : paidByMemberId,
    normalizedSplits,
  };
}

/** Validates and inserts without starting the background logo fetch (for callers inside a transaction). */
export function insertSubscription(ctx: ServiceCtx, userId: number, input: unknown): SubscriptionView {
  const v = SubscriptionInput.parse(input);
  const owned = ctx.db.select({ n: count() }).from(subscriptions).where(eq(subscriptions.userId, userId)).get()?.n ?? 0;
  checkLimit('subscriptions', ctx.config.limits.maxSubscriptions, owned);
  const hh = getHouseholdContext(ctx.db, userId);
  const isShared = v.shared === true;
  let householdId: number | null = null;
  let paidByMemberId: number | null = null;
  let normalizedSplits: { memberId: number; shareMinor: number | null }[] | undefined;

  if (isShared) {
    const validated = validateFamilyFields(hh, v.amountMinor, v.paidByMemberId, v.splits);
    householdId = hh!.household.id;
    paidByMemberId = validated.paidByMemberId;
    normalizedSplits = validated.normalizedSplits;
  }

  const stamp = ctx.now().toISOString();
  const row = ctx.db.transaction((tx) => {
    const inserted = tx
      .insert(subscriptions)
      .values({
        userId,
        householdId,
        paidByMemberId,
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

    if (isShared && normalizedSplits && normalizedSplits.length > 0) {
      tx.insert(subscriptionSplits)
        .values(normalizedSplits.map((s) => ({ subscriptionId: inserted.id, memberId: s.memberId, shareMinor: s.shareMinor })))
        .run();
    }
    return inserted;
  });

  return enrichSubscriptions(ctx.db, userId, [row], hh)[0]!;
}

export function createSubscription(ctx: ServiceCtx, userId: number, input: unknown): SubscriptionView {
  const row = insertSubscription(ctx, userId, input);
  if (row.domain) fetchLogoInBackground(ctx, row.id, row.domain);
  return row;
}

export function updateSubscription(ctx: ServiceCtx, userId: number, id: number, patch: unknown): SubscriptionView {
  const v = SubscriptionPatch.parse(patch);
  const before = getSubscription(ctx, userId, id);
  if (!before.canEdit) throw new ForbiddenError('forbidden');

  const hh = getHouseholdContext(ctx.db, userId);
  const targetAmount = v.amountMinor ?? before.amountMinor;
  const targetShared = v.shared !== undefined ? v.shared : before.householdId !== null;

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

  let replaceSplits: { memberId: number; shareMinor: number | null }[] | undefined;
  let clearSplits = false;

  if (!targetShared) {
    if (before.householdId !== null) {
      set.householdId = null;
      set.paidByMemberId = null;
      clearSplits = true;
    }
  } else {
    if (!hh) throw new BadRequestError('family_required');
    set.householdId = hh.household.id;
    const paidByArg =
      v.paidByMemberId !== undefined
        ? v.paidByMemberId
        : before.householdId === null
          ? hh.me.id
          : before.paidByMemberId;
    const validated = validateFamilyFields(hh, targetAmount, paidByArg, v.splits);
    if (v.paidByMemberId !== undefined || before.householdId === null) {
      set.paidByMemberId = validated.paidByMemberId;
    }
    if (validated.normalizedSplits !== undefined) {
      replaceSplits = validated.normalizedSplits;
    } else if (v.amountMinor !== undefined && v.amountMinor !== before.amountMinor) {
      const existingSplits = ctx.db.select().from(subscriptionSplits).where(eq(subscriptionSplits.subscriptionId, id)).all();
      const hasCustom = existingSplits.some((s) => s.shareMinor !== null);
      if (hasCustom) {
        const sum = existingSplits.reduce((acc, s) => acc + (s.shareMinor ?? 0), 0);
        if (sum !== targetAmount) throw new BadRequestError('split_sum_mismatch');
      }
    }
  }

  const row = ctx.db.transaction((tx) => {
    const updated = tx.update(subscriptions).set(set).where(eq(subscriptions.id, id)).returning().get();
    if (clearSplits) {
      tx.delete(subscriptionSplits).where(eq(subscriptionSplits.subscriptionId, id)).run();
    } else if (replaceSplits !== undefined) {
      tx.delete(subscriptionSplits).where(eq(subscriptionSplits.subscriptionId, id)).run();
      if (replaceSplits.length > 0) {
        tx.insert(subscriptionSplits)
          .values(replaceSplits.map((s) => ({ subscriptionId: id, memberId: s.memberId, shareMinor: s.shareMinor })))
          .run();
      }
    }
    return updated;
  });

  if (row.domain && row.domain !== before.domain) fetchLogoInBackground(ctx, row.id, row.domain);
  const enriched = enrichSubscriptions(ctx.db, userId, [row], hh)[0]!;
  if (row.amountMinor !== before.amountMinor) notifyPriceChange(ctx, row, before.amountMinor, row.amountMinor, null);
  return enriched;
}

export function deleteSubscription(ctx: ServiceCtx, userId: number, id: number): void {
  const sub = getSubscription(ctx, userId, id);
  if (!sub.canEdit) throw new ForbiddenError('forbidden');
  ctx.db.delete(subscriptions).where(eq(subscriptions.id, id)).run();
}

function accessibleSubscriptionsCondition(db: ServiceCtx['db'], userId: number) {
  const hh = getHouseholdContext(db, userId);
  return hh
    ? or(and(eq(subscriptions.userId, userId), isNull(subscriptions.householdId)), eq(subscriptions.householdId, hh.household.id))
    : eq(subscriptions.userId, userId);
}

export function listPayments(ctx: ServiceCtx, userId: number, filter: PaymentQuery = {}): PaymentRow[] {
  const conds = [accessibleSubscriptionsCondition(ctx.db, userId)];
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
    .select({ p: payments, s: subscriptions })
    .from(payments)
    .innerJoin(subscriptions, eq(payments.subscriptionId, subscriptions.id))
    .where(eq(payments.id, paymentId))
    .get();
  if (!row) throw new NotFoundError('payment');
  const hh = getHouseholdContext(ctx.db, userId);
  const ok = row.s.userId === userId || (row.s.householdId !== null && row.s.householdId === hh?.household.id);
  if (!ok) throw new NotFoundError('payment');
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

export function buildAmountOverrides(
  subs: SubscriptionView[],
  hh: HouseholdContext | null,
  opts: { scope?: FamilyScope; memberId?: number },
): Map<number, number> | undefined {
  if (!hh) return undefined;
  const scope = opts.scope ?? 'mine';
  const overrides = new Map<number, number>();
  for (const sub of subs) {
    if (sub.householdId === null) continue;
    if (scope === 'mine') {
      overrides.set(sub.id, sub.myShareMinor);
    } else if (opts.memberId !== undefined) {
      const share = sub.splits.find((sp) => sp.memberId === opts.memberId);
      overrides.set(sub.id, share?.effectiveMinor ?? 0);
    }
  }
  return overrides.size > 0 ? overrides : undefined;
}

export function buildMemberBreakdown(subs: SubscriptionView[], hh: HouseholdContext | null) {
  if (!hh) return undefined;
  const memberAmounts = new Map<number, Map<number, number>>();
  for (const m of hh.members) memberAmounts.set(m.id, new Map());
  for (const sub of subs) {
    if (sub.householdId === null) {
      memberAmounts.get(hh.me.id)?.set(sub.id, sub.amountMinor);
    } else {
      for (const sp of sub.splits) {
        memberAmounts.get(sp.memberId)?.set(sub.id, sp.effectiveMinor);
      }
    }
  }
  return {
    members: hh.members.map((m) => ({ id: m.id, name: m.name, color: m.color })),
    memberAmounts,
  };
}

export function getSummary(
  ctx: ServiceCtx,
  userId: number,
  now: Date,
  opts: { scope?: FamilyScope; memberId?: number } = {},
): Summary {
  const s = getSettings(ctx, userId);
  const today = todayIn(s.timezone, now);
  const hh = getHouseholdContext(ctx.db, userId);
  const subs = listSubscriptions(ctx, userId, { includeInactive: true, scope: opts.scope, memberId: opts.memberId });
  const ids = subs.map((x) => x.id);
  const pays = ids.length ? ctx.db.select().from(payments).where(inArray(payments.subscriptionId, ids)).all() : [];
  const amountOverrides = buildAmountOverrides(subs, hh, opts);
  return computeSummary({ subs, payments: pays, today, rates: getRates(ctx.db, s.baseCurrency, today), amountOverrides });
}
