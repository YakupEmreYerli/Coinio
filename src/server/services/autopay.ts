import { and, eq, lte } from 'drizzle-orm';
import { payments, subscriptions } from '../db/schema.js';
import { dueDatesThrough, nextDue, todayIn } from '../../shared/schedule.js';
import { getSettings } from './settings.js';
import type { ServiceCtx } from './context.js';

/**
 * Mark every due occurrence of active auto-pay subscriptions as paid (source 'auto') and advance
 * next_due past today. Existing rows (including voided ones) are kept as they are.
 * Returns the number of payments created.
 */
export function runAutoPay(ctx: ServiceCtx): number {
  const now = ctx.now();
  // "Today" is the owner's local day; the latest local day anywhere bounds the query.
  const todayOf = new Map<number, string>();
  const ownerToday = (userId: number) => {
    let d = todayOf.get(userId);
    if (d === undefined) todayOf.set(userId, (d = todayIn(getSettings(ctx, userId).timezone, now)));
    return d;
  };
  const latest = todayIn('Pacific/Kiritimati', now);
  const due = ctx.db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.autoPay, true), eq(subscriptions.active, true), lte(subscriptions.nextDue, latest)))
    .all();

  let created = 0;
  for (const sub of due) {
    const today = ownerToday(sub.userId);
    if (sub.nextDue > today) continue;
    ctx.db.transaction((tx) => {
      for (const dueDate of dueDatesThrough(sub.nextDue, today, sub.cycle, sub.intervalCount, sub.anchorDay)) {
        const res = tx
          .insert(payments)
          .values({
            subscriptionId: sub.id,
            dueDate,
            paidAt: now.toISOString(),
            amountMinor: sub.amountMinor,
            currency: sub.currency,
            source: 'auto',
            status: 'paid',
          })
          .onConflictDoNothing()
          .run();
        created += res.changes;
      }
      // First due date after today.
      let next = sub.nextDue;
      while (next <= today) next = nextDue(next, sub.cycle, sub.intervalCount, sub.anchorDay);
      tx.update(subscriptions).set({ nextDue: next, updatedAt: now.toISOString() }).where(eq(subscriptions.id, sub.id)).run();
    });
  }
  return created;
}
