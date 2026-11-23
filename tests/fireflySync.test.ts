import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { fireflyConnections, fireflyLinks, subscriptions, users } from '../src/server/db/schema.js';
import type { ServiceCtx } from '../src/server/services/context.js';
import { listBills, type FfBill } from '../src/server/services/firefly/client.js';
import { hashMapped, mappedFromBill, mappedFromSubscription } from '../src/server/services/firefly/mapping.js';
import { syncDefinitions } from '../src/server/services/firefly/sync.js';
import { deleteSubscription, insertSubscription, markPaid, updateSubscription } from '../src/server/services/subscriptions.js';
import { fakeFirefly } from './fixtures/fakeFirefly.js';
import { makeTestApp } from './helpers.js';

const conn = { baseUrl: 'https://ff.example.com', token: 'tok' };

const bill = (id: string, over: Partial<FfBill> = {}): FfBill => ({
  id, name: 'Spotify', amountMin: '25.00', amountMax: '25.00', currencyCode: 'EUR', date: '2026-01-09T00:00:00+01:00',
  repeatFreq: 'monthly', skip: 0, active: true, notes: null, updatedAt: '2026-11-01T00:00:00+00:00', nextExpectedMatch: '2026-12-09T00:00:00+01:00',
  ...over,
});

function setup(bills: FfBill[] = [], connOver: Partial<typeof fireflyConnections.$inferInsert> = {}) {
  const t = makeTestApp();
  const fake = fakeFirefly({ token: 'tok', bills }, () => t.clock.now);
  const ctx: ServiceCtx = { db: t.db, config: t.config, fetch: fake.fetch, now: () => t.clock.now };
  const now = t.clock.now.toISOString();
  const user = t.db.insert(users).values({ username: 'y', passwordHash: 'x', createdAt: now }).returning().get();
  t.db.insert(fireflyConnections).values({ userId: user.id, ...conn, assetAccountId: '1', initialSyncDone: true, createdAt: now, updatedAt: now, ...connOver }).run();
  const addSub = (over: Record<string, unknown> = {}) =>
    insertSubscription(ctx, user.id, { name: 'Spotify', amountMinor: 2500, currency: 'EUR', cycle: 'monthly', intervalCount: 1, nextDue: '2026-12-09', ...over });
  const sub = (id: number) => t.db.select().from(subscriptions).where(eq(subscriptions.id, id)).get()!;
  /** A link whose hashes match both sides as they are now. */
  const link = (subId: number, billId: string) =>
    t.db.insert(fireflyLinks).values({
      userId: user.id, subscriptionId: subId, billId, coinioHash: hashMapped(mappedFromSubscription(sub(subId))),
      fireflyHash: hashMapped(mappedFromBill(fake.bills.get(billId)!)),
    }).returning().get();
  const links = () => t.db.select().from(fireflyLinks).all();
  const run = async () => syncDefinitions(ctx, user.id, conn, await listBills(ctx, conn));
  const writes = () => fake.calls.filter((c) => c.method !== 'GET');
  return { ...t, fake, ctx, user, addSub, sub, link, links, run, writes };
}

describe('syncDefinitions', () => {
  it('coinio change is written to the bill', async () => {
    const s = setup([bill('7')]);
    const sub = s.addSub();
    s.link(sub.id, '7');
    updateSubscription(s.ctx, s.user.id, sub.id, { amountMinor: 3000 });
    const res = await s.run();
    expect(res.updated).toEqual({ coinio: 0, firefly: 1 });
    expect(s.writes()).toHaveLength(1);
    expect(s.writes()[0]).toMatchObject({ method: 'PUT', path: '/api/v1/bills/7', body: { amount_max: '30.00' } });
    expect(s.writes()[0]!.body).not.toHaveProperty('date');
    expect(s.fake.bills.get('7')!.amountMax).toBe('30.00');
  });

  it('a cycle change also sends the date', async () => {
    const s = setup([bill('7')]);
    const sub = s.addSub();
    s.link(sub.id, '7');
    updateSubscription(s.ctx, s.user.id, sub.id, { cycle: 'yearly' });
    await s.run();
    expect(s.writes()[0]!.body).toMatchObject({ repeat_freq: 'yearly', date: '2026-12-09' });
  });

  it('firefly change is written to the subscription', async () => {
    const s = setup([bill('7')]);
    const sub = s.addSub();
    s.link(sub.id, '7');
    Object.assign(s.fake.bills.get('7')!, { amountMin: '30.00', amountMax: '30.00', repeatFreq: 'quarterly', updatedAt: '2026-11-18T10:00:00Z' });
    const res = await s.run();
    expect(res.updated).toEqual({ coinio: 1, firefly: 0 });
    expect(s.writes()).toHaveLength(0);
    expect(s.sub(sub.id)).toMatchObject({ amountMinor: 3000, cycle: 'monthly', intervalCount: 3 });
  });

  it('both changed: newer updated_at wins', async () => {
    const s = setup([bill('7'), bill('8', { name: 'Netflix' })]);
    const a = s.addSub();
    const b = s.addSub({ name: 'Netflix' });
    s.link(a.id, '7');
    s.link(b.id, '8');
    s.clock.set('2026-11-18T10:00:00Z');
    updateSubscription(s.ctx, s.user.id, a.id, { name: 'Spotify Coinio' });
    updateSubscription(s.ctx, s.user.id, b.id, { name: 'Netflix Coinio' });
    Object.assign(s.fake.bills.get('7')!, { name: 'Spotify Firefly', updatedAt: '2026-11-18T11:00:00Z' });
    Object.assign(s.fake.bills.get('8')!, { name: 'Netflix Firefly', updatedAt: '2026-11-18T09:30:00Z' });
    const res = await s.run();
    expect(res.updated).toEqual({ coinio: 1, firefly: 1 });
    expect(s.sub(a.id).name).toBe('Spotify Firefly');
    expect(s.fake.bills.get('7')!.name).toBe('Spotify Firefly');
    expect(s.sub(b.id).name).toBe('Netflix Coinio');
    expect(s.fake.bills.get('8')!.name).toBe('Netflix Coinio');
  });

  it('a second run after a write changes nothing', async () => {
    const s = setup([bill('7', { amountMin: '20.00', amountMax: '30.00' }), bill('8', { name: 'Netflix' })]);
    const a = s.addSub({ variableAmount: true, amountMinor: 3000 });
    const b = s.addSub({ name: 'Netflix' });
    s.link(a.id, '7');
    s.link(b.id, '8');
    updateSubscription(s.ctx, s.user.id, a.id, { notes: 'family' });
    Object.assign(s.fake.bills.get('8')!, { notes: 'shared', updatedAt: '2026-11-18T10:00:00Z' });
    expect((await s.run()).updated).toEqual({ coinio: 1, firefly: 1 });
    const before = s.fake.calls.length;
    const res = await s.run();
    expect(res.updated).toEqual({ coinio: 0, firefly: 0 });
    expect(s.fake.calls.slice(before).every((c) => c.method === 'GET')).toBe(true);
  });

  it('marking a payment paid does not touch the bill', async () => {
    const s = setup([bill('7')]);
    const sub = s.addSub();
    s.link(sub.id, '7');
    markPaid(s.ctx, s.user.id, sub.id, { now: s.ctx.now() });
    await s.run();
    expect(s.writes()).toHaveLength(0);
  });

  it('bill deleted in firefly deactivates the subscription and closes the link', async () => {
    const s = setup([bill('7')]);
    const sub = s.addSub();
    s.link(sub.id, '7');
    s.fake.bills.delete('7');
    const res = await s.run();
    expect(res.deactivated).toEqual({ coinio: 1, firefly: 0 });
    expect(s.sub(sub.id).active).toBe(false);
    expect(s.links()[0]!.state).toBe('closed');
    expect(s.writes()).toHaveLength(0);
    const before = s.fake.calls.length;
    await s.run();
    expect(s.fake.calls.slice(before).every((c) => c.path.startsWith('/api/v1/bills?'))).toBe(true);
  });

  it('subscription deleted in coinio deactivates the bill', async () => {
    const s = setup([bill('7')]);
    const sub = s.addSub();
    s.link(sub.id, '7');
    deleteSubscription(s.ctx, s.user.id, sub.id);
    const res = await s.run();
    expect(res.deactivated).toEqual({ coinio: 0, firefly: 1 });
    expect(s.writes()).toEqual([{ method: 'PUT', path: '/api/v1/bills/7', body: { active: false } }]);
    expect(s.fake.calls.some((c) => c.method === 'DELETE')).toBe(false);
    expect(s.fake.bills.get('7')!.active).toBe(false);
    expect(s.links()[0]!.state).toBe('closed');
  });

  it('new subscription after the first sync creates a bill with date = nextDue', async () => {
    const s = setup();
    const sub = s.addSub({ nextDue: '2026-12-15', amountMinor: 999, variableAmount: true });
    const res = await s.run();
    expect(res.created).toEqual({ coinio: 0, firefly: 1 });
    expect(s.writes()).toHaveLength(1);
    expect(s.writes()[0]).toMatchObject({ method: 'POST', path: '/api/v1/bills', body: { name: 'Spotify', amount_max: '9.99', date: '2026-12-15' } });
    expect(s.links()).toMatchObject([{ subscriptionId: sub.id, billId: '1', state: 'open' }]);
    const before = s.fake.calls.length;
    expect((await s.run()).updated).toEqual({ coinio: 0, firefly: 0 });
    expect(s.fake.calls.slice(before).every((c) => c.method === 'GET')).toBe(true);
    expect(s.sub(sub.id).variableAmount).toBe(true);
  });

  it('new bill after the first sync creates a subscription', async () => {
    const s = setup([bill('7', { name: 'Disney', active: false })]);
    const res = await s.run();
    expect(res.created).toEqual({ coinio: 1, firefly: 0 });
    const rows = s.db.select().from(subscriptions).all();
    expect(rows).toMatchObject([{ name: 'Disney', amountMinor: 2500, nextDue: '2026-12-09', autoPay: false, active: false }]);
    expect(s.links()).toMatchObject([{ subscriptionId: rows[0]!.id, billId: '7', state: 'open' }]);
    const before = s.fake.calls.length;
    await s.run();
    expect(s.fake.calls.slice(before).every((c) => c.method === 'GET')).toBe(true);
    expect(s.db.select().from(subscriptions).all()).toHaveLength(1);
  });

  it('excluded records are left alone', async () => {
    const s = setup([bill('9', { name: 'Disney' })]);
    const sub = s.addSub();
    s.db.update(fireflyConnections).set({ excluded: { subscriptions: [sub.id], bills: ['9'] } }).run();
    const res = await s.run();
    expect(res.created).toEqual({ coinio: 0, firefly: 0 });
    expect(s.writes()).toHaveLength(0);
    expect(s.db.select().from(subscriptions).all()).toHaveLength(1);
    expect(s.links()).toHaveLength(0);
  });

  it('creates nothing before the first sync is done', async () => {
    const s = setup([bill('9', { name: 'Disney' })], { initialSyncDone: false });
    s.addSub();
    await s.run();
    expect(s.writes()).toHaveLength(0);
    expect(s.links()).toHaveLength(0);
  });

  it('a record that cannot be mapped is skipped', async () => {
    const s = setup([bill('8', { name: 'Odd', skip: 40 }), bill('9', { name: 'Disney' })]);
    await s.run();
    expect(s.db.select().from(subscriptions).all().map((r) => r.name)).toEqual(['Disney']);
  });

  it('empty stored hashes let the newer side win', async () => {
    const s = setup([bill('7', { name: 'Spotify Family', updatedAt: '2026-11-18T10:00:00Z' })]);
    const sub = s.addSub();
    s.db.insert(fireflyLinks).values({ userId: s.user.id, subscriptionId: sub.id, billId: '7', coinioHash: '', fireflyHash: '' }).run();
    await s.run();
    expect(s.sub(sub.id).name).toBe('Spotify Family');
    expect(s.writes()).toHaveLength(0);
  });
});
