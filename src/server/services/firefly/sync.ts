// Two-way sync of subscription definitions and Firefly bills. Nothing is ever deleted on either side.
import { and, eq, gte } from 'drizzle-orm';
import { fireflyLinks, fireflyPaymentLinks, payments, subscriptions } from '../../db/schema.js';
import type { SubscriptionRow } from '../../domain/summary.js';
import { convertMinor, decimalToMinor, minorToDecimal } from '../../../shared/money.js';
import { addDays, daysBetween } from '../../../shared/notify/vars.js';
import { dueDatesThrough, todayIn } from '../../../shared/schedule.js';
import type { ServiceCtx } from '../context.js';
import { getRates } from '../fx.js';
import { getSettings } from '../settings.js';
import { insertSubscription, listSubscriptions, markPaid, updateSubscription } from '../subscriptions.js';
import {
  FireflyError, billJournals, createBill, createWithdrawal, getBill, listAssetAccounts, updateBill,
  type FfBill, type FfBillWrite, type FfJournal, type FireflyConn,
} from './client.js';
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

export type PaymentsResult = { paymentsIn: number; paymentsOut: number; warning: 'no_account' | 'no_rate' | null };

/** The open period within ±7 days of the journal's day that has no paid or skipped payment; the nearest, earlier on a tie. */
function periodFor(ctx: ServiceCtx, sub: SubscriptionRow, day: string): string | null {
  const rows = ctx.db.select().from(payments).where(eq(payments.subscriptionId, sub.id)).all();
  const taken = new Set(rows.filter((p) => p.status !== 'void').map((p) => p.dueDate));
  const candidates = [
    ...dueDatesThrough(sub.nextDue, addDays(day, 7), sub.cycle, sub.intervalCount, sub.anchorDay),
    ...rows.filter((p) => p.status === 'void').map((p) => p.dueDate),
  ].filter((d) => !taken.has(d) && Math.abs(daysBetween(day, d)) <= 7);
  candidates.sort((a, b) => Math.abs(daysBetween(day, a)) - Math.abs(daysBetween(day, b)) || a.localeCompare(b));
  return candidates[0] ?? null;
}

/** The journal's amount in the subscription's currency when Firefly has it, otherwise in its own; always positive. */
function journalAmount(j: FfJournal, currency: string): { amountMinor: number | null; currency: string } {
  const [amount, cur] = j.currencyCode === currency || j.foreignCurrencyCode !== currency || j.foreignAmount === null
    ? [j.amount, j.currencyCode] : [j.foreignAmount, currency];
  return { amountMinor: decimalToMinor(Math.abs(Number(amount)), cur), currency: cur };
}

/** Pulls bill transactions into Coinio payments, then pushes Coinio payments made since the connection to Firefly. */
export async function syncPayments(ctx: ServiceCtx, userId: number, conn: FireflyConn, since: string): Promise<PaymentsResult> {
  const out: PaymentsResult = { paymentsIn: 0, paymentsOut: 0, warning: null };
  const connection = getConnection(ctx, userId);
  if (!connection) return out;
  const settings = getSettings(ctx, userId);
  const today = todayIn(settings.timezone, ctx.now());
  const payLinks = () => ctx.db.select().from(fireflyPaymentLinks).where(eq(fireflyPaymentLinks.userId, userId)).all();
  const subOf = (id: number) => ctx.db.select().from(subscriptions).where(eq(subscriptions.id, id)).get();

  // A voided auto payment that is paid again is the same row, so it goes back to its Firefly transaction.
  for (const pl of payLinks()) {
    const p = pl.paymentId === null ? undefined : ctx.db.select().from(payments).where(eq(payments.id, pl.paymentId)).get();
    const state = p?.status === 'paid' ? 'linked' : 'released';
    if (state !== pl.state) ctx.db.update(fireflyPaymentLinks).set({ state }).where(eq(fireflyPaymentLinks.id, pl.id)).run();
  }

  const links = ctx.db.select().from(fireflyLinks).where(and(eq(fireflyLinks.userId, userId), eq(fireflyLinks.state, 'open'))).all();
  const known = new Set(payLinks().map((pl) => pl.journalId));
  for (const link of links) {
    if (link.subscriptionId === null) continue;
    for (const j of await billJournals(ctx, conn, link.billId, since, today)) {
      const sub = subOf(link.subscriptionId);
      if (!sub || known.has(j.journalId)) continue;
      const day = j.date.slice(0, 10);
      const dueDate = periodFor(ctx, sub, day);
      const { amountMinor, currency } = journalAmount(j, sub.currency);
      if (!dueDate || amountMinor === null) continue;
      ctx.db.transaction((tx) => {
        const p = markPaid({ ...ctx, db: tx as typeof ctx.db }, userId, sub.id, {
          dueDate, paidAt: new Date(`${day}T00:00:00Z`).toISOString(), source: 'firefly', amountMinor, currency, now: ctx.now(),
        });
        tx.insert(fireflyPaymentLinks).values({ userId, linkId: link.id, paymentId: p.id, journalId: j.journalId, groupId: j.groupId }).run();
      });
      known.add(j.journalId);
      out.paymentsIn++;
    }
  }

  const pushed = new Set(payLinks().map((pl) => pl.paymentId));
  let accounts: Awaited<ReturnType<typeof listAssetAccounts>> | undefined;
  const rates = getRates(ctx.db, settings.baseCurrency, today).rates;
  const rateOf = (cur: string) => (cur === settings.baseCurrency ? 1 : rates[cur]);
  for (const link of links) {
    const sub = link.subscriptionId === null ? undefined : subOf(link.subscriptionId);
    if (!sub) continue;
    const paid = ctx.db.select().from(payments)
      .where(and(eq(payments.subscriptionId, sub.id), eq(payments.status, 'paid'), gte(payments.paidAt, connection.createdAt)))
      .orderBy(payments.dueDate).all().filter((p) => !pushed.has(p.id));
    for (const p of paid) {
      const journals = await billJournals(ctx, conn, link.billId, addDays(p.dueDate, -7), addDays(p.dueDate, 7));
      let j = journals.find((x) => !known.has(x.journalId));
      if (!j) {
        const accountId = link.assetAccountId || connection.assetAccountId;
        accounts ??= accountId ? await listAssetAccounts(ctx, conn) : undefined;
        const account = accounts?.find((a) => a.id === accountId);
        if (!account) {
          out.warning = 'no_account';
          continue;
        }
        const from = rateOf(p.currency);
        const to = rateOf(account.currencyCode);
        const foreign = account.currencyCode !== p.currency;
        if (foreign && (from === undefined || to === undefined)) {
          out.warning = 'no_rate';
          continue;
        }
        const amountMinor = foreign ? convertMinor(p.amountMinor, p.currency, account.currencyCode, from! / to!) : p.amountMinor;
        j = await createWithdrawal(ctx, conn, {
          date: p.paidAt.slice(0, 10), amount: minorToDecimal(amountMinor, account.currencyCode), currency_code: account.currencyCode,
          ...(foreign && { foreign_amount: minorToDecimal(p.amountMinor, p.currency), foreign_currency_code: p.currency }),
          description: sub.name, source_id: account.id, destination_name: sub.name, bill_id: link.billId,
          ...(sub.category && { category_name: sub.category }),
        });
        out.paymentsOut++;
      }
      ctx.db.insert(fireflyPaymentLinks).values({ userId, linkId: link.id, paymentId: p.id, journalId: j.journalId, groupId: j.groupId }).run();
      known.add(j.journalId);
    }
  }
  return out;
}
