// Two-way sync of subscription definitions and Firefly bills. Nothing is ever deleted on either side.
import { eq } from 'drizzle-orm';
import { fireflyLinks, subscriptions } from '../../db/schema.js';
import type { SubscriptionRow } from '../../domain/summary.js';
import { todayIn } from '../../../shared/schedule.js';
import type { ServiceCtx } from '../context.js';
import { getSettings } from '../settings.js';
import { insertSubscription, listSubscriptions, updateSubscription } from '../subscriptions.js';
import { FireflyError, createBill, getBill, updateBill, type FfBill, type FfBillWrite, type FireflyConn } from './client.js';
import { billWrite, hashMapped, mappedFromBill, mappedFromSubscription, subscriptionInput, subscriptionPatch } from './mapping.js';
import { getConnection } from './store.js';

type Counts = { coinio: number; firefly: number };
export type SyncResult = { created: Counts; updated: Counts; deactivated: Counts; paymentsIn: number; paymentsOut: number };
type LinkRow = typeof fireflyLinks.$inferSelect;

const subHash = (s: SubscriptionRow) => hashMapped(mappedFromSubscription(s));
const billHash = (b: FfBill) => hashMapped(mappedFromBill(b));

/** Runs one record's step; a record that cannot be mapped or validated is skipped, Firefly errors stop the run. */
async function each(kind: 'subscription' | 'bill', id: number | string, step: () => Promise<void>): Promise<void> {
  try {
    await step();
  } catch (err) {
    if (err instanceof FireflyError) throw err;
    console.warn(`firefly sync: skipped ${kind} ${id}:`, err instanceof Error ? err.message : err);
  }
}

export async function syncDefinitions(
  ctx: ServiceCtx, userId: number, conn: FireflyConn, bills: FfBill[],
): Promise<Omit<SyncResult, 'paymentsIn' | 'paymentsOut'>> {
  const out = { created: { coinio: 0, firefly: 0 }, updated: { coinio: 0, firefly: 0 }, deactivated: { coinio: 0, firefly: 0 } };
  const connection = getConnection(ctx, userId);
  if (!connection) return out;
  const byId = new Map(bills.map((b) => [b.id, b]));
  const links = ctx.db.select().from(fireflyLinks).where(eq(fireflyLinks.userId, userId)).all();
  const subOf = (id: number) => ctx.db.select().from(subscriptions).where(eq(subscriptions.id, id)).get();
  const setLink = (id: number, set: Partial<LinkRow>) => ctx.db.update(fireflyLinks).set(set).where(eq(fireflyLinks.id, id)).run();

  for (const link of links.filter((l) => l.state === 'open')) {
    await each('bill', link.billId, async () => {
      const sub = link.subscriptionId === null ? undefined : subOf(link.subscriptionId);
      const bill = byId.get(link.billId) ?? (await getBill(ctx, conn, link.billId));
      if (!bill || !sub) {
        if (sub?.active) {
          updateSubscription(ctx, userId, sub.id, { active: false });
          out.deactivated.coinio++;
        }
        if (bill?.active) {
          await updateBill(ctx, conn, bill.id, { active: false });
          out.deactivated.firefly++;
        }
        setLink(link.id, { state: 'closed' });
        return;
      }
      const subM = mappedFromSubscription(sub);
      const billM = mappedFromBill(bill);
      const subCur = hashMapped(subM);
      const billCur = hashMapped(billM);
      const coinioChanged = !link.coinioHash || subCur !== link.coinioHash;
      const fireflyChanged = !link.fireflyHash || billCur !== link.fireflyHash;
      if (!coinioChanged && !fireflyChanged) return;
      if (subCur === billCur) return void setLink(link.id, { coinioHash: subCur, fireflyHash: billCur });
      const coinioWins = coinioChanged && (!fireflyChanged || Date.parse(sub.updatedAt) >= Date.parse(bill.updatedAt));
      if (coinioWins) {
        const withDate = subM.cycle !== billM.cycle || subM.intervalCount !== billM.intervalCount;
        const written = await updateBill(ctx, conn, bill.id, billWrite(sub, bill, { withDate }));
        setLink(link.id, { coinioHash: subCur, fireflyHash: billHash(written) });
        out.updated.firefly++;
      } else {
        const written = updateSubscription(ctx, userId, sub.id, subscriptionPatch(bill));
        setLink(link.id, { coinioHash: subHash(written), fireflyHash: billCur });
        out.updated.coinio++;
      }
    });
  }

  if (!connection.initialSyncDone) return out;
  const linkedSubs = new Set(links.map((l) => l.subscriptionId));
  const linkedBills = new Set(links.map((l) => l.billId));
  const { excluded } = connection;
  for (const sub of listSubscriptions(ctx, userId)) {
    if (!sub.active || linkedSubs.has(sub.id) || excluded.subscriptions.includes(sub.id)) continue;
    await each('subscription', sub.id, async () => {
      const written = await createBill(ctx, conn, billWrite(sub, null, { withDate: true }) as FfBillWrite);
      ctx.db.insert(fireflyLinks).values({ userId, subscriptionId: sub.id, billId: written.id, coinioHash: subHash(sub), fireflyHash: billHash(written) }).run();
      out.created.firefly++;
    });
  }
  const today = todayIn(getSettings(ctx, userId).timezone, ctx.now());
  for (const bill of bills) {
    if (!bill.active || linkedBills.has(bill.id) || excluded.bills.includes(bill.id)) continue;
    await each('bill', bill.id, async () => {
      const sub = insertSubscription(ctx, userId, subscriptionInput(bill, today));
      ctx.db.insert(fireflyLinks).values({ userId, subscriptionId: sub.id, billId: bill.id, coinioHash: subHash(sub), fireflyHash: billHash(bill) }).run();
      out.created.coinio++;
    });
  }
  return out;
}
