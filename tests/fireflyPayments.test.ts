import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { fireflyConnections, fireflyLinks, fireflyPaymentLinks, fxRates, payments, subscriptions, users } from '../src/server/db/schema.js';
import type { ServiceCtx } from '../src/server/services/context.js';
import type { FfBill, FfJournal } from '../src/server/services/firefly/client.js';
import { syncPayments } from '../src/server/services/firefly/sync.js';
import { insertSubscription, markPaid, undoPayment } from '../src/server/services/subscriptions.js';
import { fakeFirefly } from './fixtures/fakeFirefly.js';
import { makeTestApp } from './helpers.js';

const conn = { baseUrl: 'https://ff.example.com', token: 'tok' };
const SINCE = '2025-11-18';

const bill = (id: string): FfBill => ({
  id, name: 'Spotify', amountMin: '25.00', amountMax: '25.00', currencyCode: 'EUR', date: '2026-01-09T00:00:00+01:00',
  repeatFreq: 'monthly', skip: 0, active: true, notes: null, updatedAt: '2026-11-01T00:00:00+00:00', nextExpectedMatch: null,
});

const journal = (journalId: string, date: string, over: Partial<FfJournal> = {}): FfJournal => ({
  groupId: `g${journalId}`, journalId, date: `${date}T00:00:00+01:00`, amount: '25.00', currencyCode: 'EUR',
  foreignAmount: null, foreignCurrencyCode: null, billId: '7', ...over,
});

const accounts = [
  { id: '1', name: 'Checking', currencyCode: 'EUR' },
  { id: '2', name: 'Savings', currencyCode: 'EUR' },
  { id: '3', name: 'Lira', currencyCode: 'TRY' },
];

function setup(o: { journals?: FfJournal[]; sub?: Record<string, unknown>; conn?: Partial<typeof fireflyConnections.$inferInsert>; linkAccount?: string } = {}) {
  const t = makeTestApp();
  const fake = fakeFirefly({ token: 'tok', bills: [bill('7')], journals: o.journals ?? [], accounts }, () => t.clock.now);
  const ctx: ServiceCtx = { db: t.db, config: t.config, fetch: fake.fetch, now: () => t.clock.now };
  const now = t.clock.now.toISOString();
  const user = t.db.insert(users).values({ username: 'y', passwordHash: 'x', createdAt: now }).returning().get();
  t.db.insert(fireflyConnections).values({
    userId: user.id, ...conn, assetAccountId: '1', initialSyncDone: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: now, ...o.conn,
  }).run();
  const sub = insertSubscription(ctx, user.id, {
    name: 'Spotify', amountMinor: 2500, currency: 'EUR', cycle: 'monthly', intervalCount: 1, nextDue: '2026-11-09', autoPay: false, ...o.sub,
  });
  const link = t.db.insert(fireflyLinks).values({ userId: user.id, subscriptionId: sub.id, billId: '7', coinioHash: 'h', fireflyHash: 'h', assetAccountId: o.linkAccount ?? null })
    .returning().get();
  const run = () => syncPayments(ctx, user.id, conn, SINCE);
  const pays = () => t.db.select().from(payments).where(eq(payments.subscriptionId, sub.id)).all();
  const payLinks = () => t.db.select().from(fireflyPaymentLinks).all();
  const posts = () => fake.calls.filter((c) => c.method === 'POST' && c.path === '/api/v1/transactions');
  const subRow = () => t.db.select().from(subscriptions).where(eq(subscriptions.id, sub.id)).get()!;
  const rate = (quote: string, r: number) =>
    t.db.insert(fxRates).values({ base: 'USD', quote, rate: r, date: '2026-11-17', fetchedAt: '2026-11-18' }).run();
  return { ...t, fake, ctx, user, sub, link, run, pays, payLinks, posts, subRow, rate };
}

describe('syncPayments', () => {
  it('a bill transaction marks the nearest unpaid period paid with source firefly and the transaction date', async () => {
    const s = setup({ journals: [journal('5', '2026-11-10', { amount: '-7.50' })], sub: { amountMinor: 750, cycle: 'weekly', nextDue: '2026-11-04' } });
    const res = await s.run();
    expect(res).toEqual({ paymentsIn: 1, paymentsOut: 0, warning: null });
    expect(s.pays()).toEqual([
      expect.objectContaining({ dueDate: '2026-11-11', paidAt: '2026-11-10T00:00:00.000Z', source: 'firefly', amountMinor: 750, currency: 'EUR', status: 'paid' }),
    ]);
    expect(s.payLinks()).toEqual([
      expect.objectContaining({ userId: s.user.id, linkId: s.link.id, paymentId: s.pays()[0]!.id, journalId: '5', groupId: 'g5', state: 'linked' }),
    ]);
    expect(s.subRow().nextDue).toBe('2026-11-04');
  });

  it('a transaction 10 days from any due date is ignored', async () => {
    const s = setup({ journals: [journal('5', '2026-10-30'), journal('6', '2026-11-19')] });
    s.clock.set('2026-11-20T09:00:00Z');
    const res = await s.run();
    expect(res.paymentsIn).toBe(0);
    expect(s.pays()).toEqual([]);
    expect(s.payLinks()).toEqual([]);
  });

  it('a payment pulled from firefly is not pushed back', async () => {
    const s = setup({ journals: [journal('5', '2026-11-10')] });
    await s.run();
    expect(s.pays()).toHaveLength(1);
    expect(s.subRow().nextDue).toBe('2026-12-09');
    s.clock.set('2026-11-19T09:00:00Z');
    const res = await s.run();
    expect(res).toEqual({ paymentsIn: 0, paymentsOut: 0, warning: null });
    expect(s.posts()).toHaveLength(0);
    expect(s.pays()).toHaveLength(1);
    expect(s.payLinks()).toHaveLength(1);
  });

  it('inbound amount is taken in the subscription currency', async () => {
    const s = setup({ journals: [journal('5', '2026-11-10', { amount: '-1100.00', currencyCode: 'TRY', foreignAmount: '-24.99', foreignCurrencyCode: 'EUR' })] });
    await s.run();
    expect(s.pays()[0]).toMatchObject({ amountMinor: 2499, currency: 'EUR' });
  });

  it('a coinio payment links to an existing firefly transaction instead of creating one', async () => {
    const s = setup({ journals: [journal('5', '2026-11-10')] });
    const p = markPaid(s.ctx, s.user.id, s.sub.id, { now: s.clock.now });
    const res = await s.run();
    expect(res).toEqual({ paymentsIn: 0, paymentsOut: 0, warning: null });
    expect(s.posts()).toHaveLength(0);
    expect(s.pays()).toHaveLength(1);
    expect(s.payLinks()).toEqual([expect.objectContaining({ paymentId: p.id, journalId: '5', groupId: 'g5', state: 'linked' })]);
  });

  it('a coinio payment with no match creates a withdrawal on the chosen account', async () => {
    const s = setup({ sub: { category: 'Music' } });
    const p = markPaid(s.ctx, s.user.id, s.sub.id, { paidAt: '2026-11-10T12:00:00.000Z', now: s.clock.now });
    const res = await s.run();
    expect(res).toEqual({ paymentsIn: 0, paymentsOut: 1, warning: null });
    expect(s.posts()).toHaveLength(1);
    expect(s.posts()[0]!.body).toEqual({
      transactions: [{
        type: 'withdrawal', date: '2026-11-10', amount: '25.00', currency_code: 'EUR', description: 'Spotify', source_id: '1',
        destination_name: 'Spotify', bill_id: '7', category_name: 'Music',
      }],
    });
    const created = s.fake.journals[0]!;
    expect(s.payLinks()).toEqual([expect.objectContaining({ paymentId: p.id, journalId: created.journalId, groupId: created.groupId, state: 'linked' })]);
    await s.run();
    expect(s.posts()).toHaveLength(1);
  });

  it('per-subscription account overrides the default', async () => {
    const s = setup({ linkAccount: '2' });
    markPaid(s.ctx, s.user.id, s.sub.id, { now: s.clock.now });
    await s.run();
    expect(s.posts()[0]!.body).toMatchObject({ transactions: [{ source_id: '2' }] });
  });

  it('foreign currency: amount in account currency, foreign_amount in subscription currency', async () => {
    const s = setup({ linkAccount: '3' });
    s.rate('EUR', 1.1);
    s.rate('TRY', 0.025);
    markPaid(s.ctx, s.user.id, s.sub.id, { now: s.clock.now });
    await s.run();
    expect(s.posts()[0]!.body).toMatchObject({
      transactions: [{ amount: '1100.00', currency_code: 'TRY', foreign_amount: '25.00', foreign_currency_code: 'EUR', source_id: '3' }],
    });
  });

  it('a missing rate skips the payment with no_rate', async () => {
    const s = setup({ linkAccount: '3' });
    s.rate('EUR', 1.1);
    markPaid(s.ctx, s.user.id, s.sub.id, { now: s.clock.now });
    const res = await s.run();
    expect(res).toEqual({ paymentsIn: 0, paymentsOut: 0, warning: 'no_rate' });
    expect(s.posts()).toHaveLength(0);
    expect(s.payLinks()).toEqual([]);
  });

  it('no chosen account skips the payment with no_account', async () => {
    const s = setup({ conn: { assetAccountId: '' } });
    markPaid(s.ctx, s.user.id, s.sub.id, { now: s.clock.now });
    const res = await s.run();
    expect(res).toEqual({ paymentsIn: 0, paymentsOut: 0, warning: 'no_account' });
    expect(s.posts()).toHaveLength(0);
  });

  it('undone payment is released and its transaction is not pulled again', async () => {
    const s = setup({ journals: [journal('5', '2026-11-10')] });
    await s.run();
    undoPayment(s.ctx, s.user.id, s.pays()[0]!.id);
    const res = await s.run();
    expect(res).toEqual({ paymentsIn: 0, paymentsOut: 0, warning: null });
    expect(s.pays()).toEqual([]);
    expect(s.subRow().nextDue).toBe('2026-11-09');
    expect(s.payLinks()).toEqual([expect.objectContaining({ paymentId: null, journalId: '5', state: 'released' })]);
    expect(s.posts()).toHaveLength(0);
  });

  it('payments before the connection are not pushed', async () => {
    const s = setup({ conn: { createdAt: '2026-11-18T09:00:00.000Z' } });
    markPaid(s.ctx, s.user.id, s.sub.id, { paidAt: '2026-11-10T00:00:00.000Z', now: s.clock.now });
    const res = await s.run();
    expect(res.paymentsOut).toBe(0);
    expect(s.posts()).toHaveLength(0);
    expect(s.payLinks()).toEqual([]);
  });
});
