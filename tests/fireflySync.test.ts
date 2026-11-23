import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { fireflyConnections, fireflyLinks, payments, subscriptions, users } from '../src/server/db/schema.js';
import type { ServiceCtx } from '../src/server/services/context.js';
import { FireflyError, listBills, type FfBill, type FfJournal } from '../src/server/services/firefly/client.js';
import { hashMapped, mappedFromBill, mappedFromSubscription } from '../src/server/services/firefly/mapping.js';
import { FIREFLY_SYNC_EVERY_MS, SyncBusyError, previewInitial, runFireflySync, runInitial, syncDefinitions, syncUser } from '../src/server/services/firefly/sync.js';
import { deleteSubscription, insertSubscription, markPaid, updateSubscription } from '../src/server/services/subscriptions.js';
import { fakeFirefly } from './fixtures/fakeFirefly.js';
import { makeTestApp } from './helpers.js';

const conn = { baseUrl: 'https://ff.example.com', token: 'tok' };

const bill = (id: string, over: Partial<FfBill> = {}): FfBill => ({
  id, name: 'Spotify', amountMin: '25.00', amountMax: '25.00', currencyCode: 'EUR', date: '2026-01-09T00:00:00+01:00',
  repeatFreq: 'monthly', skip: 0, active: true, notes: null, updatedAt: '2026-11-01T00:00:00+00:00', nextExpectedMatch: '2026-12-09T00:00:00+01:00',
  ...over,
});

function setup(bills: FfBill[] = [], connOver: Partial<typeof fireflyConnections.$inferInsert> = {}, journals: FfJournal[] = []) {
  const t = makeTestApp();
  const fake = fakeFirefly({ token: 'tok', bills, journals, accounts: [{ id: '1', name: 'Checking', currencyCode: 'EUR' }] }, () => t.clock.now);
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
    const s = setup([bill('7', { name: 'Disney' })]);
    const res = await s.run();
    expect(res.created).toEqual({ coinio: 1, firefly: 0 });
    const rows = s.db.select().from(subscriptions).all();
    expect(rows).toMatchObject([{ name: 'Disney', amountMinor: 2500, nextDue: '2026-12-09', autoPay: false, active: true }]);
    expect(s.links()).toMatchObject([{ subscriptionId: rows[0]!.id, billId: '7', state: 'open' }]);
    const before = s.fake.calls.length;
    await s.run();
    expect(s.fake.calls.slice(before).every((c) => c.method === 'GET')).toBe(true);
    expect(s.db.select().from(subscriptions).all()).toHaveLength(1);
  });

  it('inactive unlinked records are not created on either side', async () => {
    const s = setup([bill('9', { name: 'Disney', active: false })]);
    updateSubscription(s.ctx, s.user.id, s.addSub({ name: 'Netflix' }).id, { active: false });
    const res = await s.run();
    expect(res.created).toEqual({ coinio: 0, firefly: 0 });
    expect(s.writes()).toHaveLength(0);
    expect(s.db.select().from(subscriptions).all()).toHaveLength(1);
    expect(s.links()).toHaveLength(0);
  });

  it('an unlinked subscription that becomes active is created as a bill', async () => {
    const s = setup();
    const sub = s.addSub();
    updateSubscription(s.ctx, s.user.id, sub.id, { active: false });
    await s.run();
    expect(s.writes()).toHaveLength(0);
    updateSubscription(s.ctx, s.user.id, sub.id, { active: true });
    const res = await s.run();
    expect(res.created).toEqual({ coinio: 0, firefly: 1 });
    expect(s.writes()).toMatchObject([{ method: 'POST', path: '/api/v1/bills', body: { active: true } }]);
    expect(s.links()).toMatchObject([{ subscriptionId: sub.id, billId: '1', state: 'open' }]);
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
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await s.run();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toBe('firefly sync: skipped bill 8:');
    warn.mockRestore();
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

describe('first sync and scheduler', () => {
  const none = { subscriptions: [], bills: [] };

  it('preview matches by name ignoring case and spaces', async () => {
    const s = setup([bill('7', { name: 'spotify ' }), bill('8', { name: 'Disney' }), bill('9', { name: 'Old', active: false })], { initialSyncDone: false });
    const a = s.addSub({ name: 'Spot ify' });
    const b = s.addSub({ name: 'Netflix' });
    updateSubscription(s.ctx, s.user.id, s.addSub({ name: 'Gone' }).id, { active: false });
    expect(await previewInitial(s.ctx, s.user.id)).toEqual({
      matched: [{ subscriptionId: a.id, billId: '7', name: 'Spot ify' }],
      toFirefly: [{ subscriptionId: b.id, name: 'Netflix' }],
      toCoinio: [{ billId: '8', name: 'Disney' }],
    });
    expect(s.writes()).toHaveLength(0);
  });

  it('initial sync links matched pairs and the newer side wins', async () => {
    const s = setup([bill('7', { name: 'spotify', amountMin: '30.00', amountMax: '30.00', updatedAt: '2026-11-18T10:00:00Z' })], { initialSyncDone: false });
    const sub = s.addSub();
    const res = await runInitial(s.ctx, s.user.id, { unmatch: [], exclude: none });
    expect(res).toEqual({ created: { coinio: 0, firefly: 0 }, updated: { coinio: 1, firefly: 0 }, deactivated: { coinio: 0, firefly: 0 }, paymentsIn: 0, paymentsOut: 0 });
    expect(s.sub(sub.id)).toMatchObject({ name: 'spotify', amountMinor: 3000 });
    expect(s.links()).toMatchObject([{ subscriptionId: sub.id, billId: '7', state: 'open' }]);
    expect(s.db.select().from(fireflyConnections).get()).toMatchObject({ initialSyncDone: true, lastSyncAt: s.clock.now.toISOString(), lastError: null });
  });

  it('unchecking a matched pair leaves both out of syncing', async () => {
    const s = setup([bill('7')], { initialSyncDone: false });
    const sub = s.addSub();
    const res = await runInitial(s.ctx, s.user.id, { unmatch: [sub.id], exclude: none });
    expect(res.created).toEqual({ coinio: 0, firefly: 0 });
    expect(s.fake.calls.filter((c) => c.method === 'POST' && c.path === '/api/v1/bills')).toEqual([]);
    expect(s.db.select().from(subscriptions).all()).toHaveLength(1);
    expect(s.links()).toEqual([]);
    expect(s.db.select().from(fireflyConnections).get()!.excluded).toEqual({ subscriptions: [sub.id], bills: ['7'] });
  });

  it('initial sync with exclude creates nothing for excluded rows', async () => {
    const s = setup([bill('7'), bill('8', { name: 'Disney' })], { initialSyncDone: false, excluded: { subscriptions: [], bills: ['3'] } });
    const sub = s.addSub();
    const res = await runInitial(s.ctx, s.user.id, { unmatch: [], exclude: { subscriptions: [sub.id], bills: ['7', '8', '3'] } });
    expect(res.created).toEqual({ coinio: 0, firefly: 0 });
    expect(s.writes()).toHaveLength(0);
    expect(s.links()).toHaveLength(0);
    expect(s.db.select().from(fireflyConnections).get()!.excluded).toEqual({ subscriptions: [sub.id], bills: ['3', '7', '8'] });
  });

  it('401 disables the connection and the scheduler stops calling firefly', async () => {
    const s = setup([bill('7')], { token: 'stale' });
    await runFireflySync(s.ctx);
    expect(s.fake.calls).toHaveLength(1);
    expect(s.db.select().from(fireflyConnections).get()).toMatchObject({ enabled: false, lastError: 'unauthorized', lastSyncAt: s.clock.now.toISOString() });
    s.clock.set(new Date(s.clock.now.getTime() + FIREFLY_SYNC_EVERY_MS + 1));
    await runFireflySync(s.ctx);
    expect(s.fake.calls).toHaveLength(1);
  });

  it('runFireflySync waits 15 minutes between runs', async () => {
    const s = setup();
    await runFireflySync(s.ctx);
    const first = s.fake.calls.length;
    expect(first).toBeGreaterThan(0);
    s.clock.set('2026-11-18T09:14:00Z');
    await runFireflySync(s.ctx);
    expect(s.fake.calls.length).toBe(first);
    s.clock.set('2026-11-18T09:15:00Z');
    await runFireflySync(s.ctx);
    expect(s.fake.calls.length).toBeGreaterThan(first);
  });

  it('runFireflySync skips connections before the first sync', async () => {
    const s = setup([bill('7')], { initialSyncDone: false });
    await runFireflySync(s.ctx);
    expect(s.fake.calls).toHaveLength(0);
  });
});

describe('syncUser', () => {
  it('a journal dated 20 days before the last sync is pulled', async () => {
    const s = setup([bill('7')], { lastSyncAt: '2026-11-18T00:00:00.000Z' }, [
      { groupId: 'g5', journalId: '5', date: '2026-10-29T00:00:00+01:00', amount: '25.00', currencyCode: 'EUR', foreignAmount: null, foreignCurrencyCode: null, billId: '7' },
    ]);
    const sub = s.addSub({ nextDue: '2026-10-30' });
    s.link(sub.id, '7');
    const res = await syncUser(s.ctx, s.user.id);
    expect(res.paymentsIn).toBe(1);
    expect(s.db.select().from(payments).all()).toMatchObject([{ dueDate: '2026-10-30', source: 'firefly' }]);
  });

  it('a second sync for the same user is refused while one is running', async () => {
    const s = setup([bill('7')]);
    const sub = s.addSub();
    s.link(sub.id, '7');
    markPaid(s.ctx, s.user.id, sub.id, { now: s.clock.now });
    const [first, second] = await Promise.allSettled([syncUser(s.ctx, s.user.id), syncUser(s.ctx, s.user.id)]);
    expect(first.status).toBe('fulfilled');
    expect(second.status).toBe('rejected');
    expect((second as PromiseRejectedResult).reason).toBeInstanceOf(SyncBusyError);
    expect(s.fake.calls.filter((c) => c.method === 'POST' && c.path === '/api/v1/transactions')).toHaveLength(1);
  });

  it('the lock is released after a failed sync', async () => {
    const s = setup([bill('7')]);
    s.fake.failNext(500);
    await expect(syncUser(s.ctx, s.user.id)).rejects.toBeInstanceOf(FireflyError);
    await expect(syncUser(s.ctx, s.user.id)).resolves.toBeDefined();
  });
});
