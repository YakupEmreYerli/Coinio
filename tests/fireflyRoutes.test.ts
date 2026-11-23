import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { fireflyConnections, fireflyLinks, fireflyPaymentLinks, subscriptions } from '../src/server/db/schema.js';
import { fakeFirefly } from './fixtures/fakeFirefly.js';
import { addUser, makeTestApp } from './helpers.js';

const TOKEN = 'SECRET-FF-TOKEN';
const accounts = [{ id: '1', name: 'Checking', currencyCode: 'EUR' }, { id: '2', name: 'Savings', currencyCode: 'EUR' }, { id: '3', name: 'Card', currencyCode: 'TRY' }];
const netflix = { name: 'Netflix', amountMinor: 1299, currency: 'EUR', cycle: 'monthly', intervalCount: 1, nextDue: '2026-12-05', autoPay: false };

async function login() {
  const fake = fakeFirefly({ token: TOKEN, accounts });
  const t = makeTestApp({ fetch: fake.fetch });
  const agent = request.agent(t.app);
  await agent.post('/api/auth/setup').send({ username: 'y', password: 'password-123456' });
  return { ...t, agent, fake };
}

describe('firefly settings API', () => {
  it('requires a session', async () => {
    const { app } = makeTestApp();
    await request(app).get('/api/firefly').expect(401);
  });

  it('connect saves after about succeeds and never returns the token', async () => {
    const { agent } = await login();
    expect((await agent.get('/api/firefly').expect(200)).body).toEqual({ connection: null });
    const put = await agent.put('/api/firefly').send({ baseUrl: 'https://ff.example.com/api/ ', token: TOKEN }).expect(200);
    expect(put.body).toEqual({ version: '6.1.21', accounts });
    const got = await agent.get('/api/firefly').expect(200);
    expect(got.body.connection).toEqual({
      baseUrl: 'https://ff.example.com', hasToken: true, assetAccountId: null, enabled: true, initialSyncDone: false,
      lastSyncAt: null, lastError: null, excluded: { subscriptions: [], bills: [] }, excludedBills: [],
    });
    expect((await agent.get('/api/firefly/accounts').expect(200)).body).toEqual({ accounts });
    const patched = await agent.patch('/api/firefly').send({ assetAccountId: '2', enabled: false, excluded: { subscriptions: [4], bills: ['9'] } }).expect(200);
    expect(patched.body).toMatchObject({ assetAccountId: '2', enabled: false, excluded: { subscriptions: [4], bills: ['9'] } });
    for (const body of [put.body, got.body, patched.body]) expect(JSON.stringify(body)).not.toContain(TOKEN);
  });

  it('connect with a wrong token answers 502 unauthorized and saves nothing', async () => {
    const { agent, db } = await login();
    const res = await agent.put('/api/firefly').send({ baseUrl: 'https://ff.example.com', token: 'wrong' }).expect(502);
    expect(res.body).toEqual({ error: 'firefly', message: 'unauthorized' });
    expect(db.select().from(fireflyConnections).all()).toEqual([]);
    await agent.put('/api/firefly').send({ baseUrl: 'https://ff.example.com' }).expect(400);
    await agent.put('/api/firefly').send({ baseUrl: 'not a url', token: TOKEN }).expect(400);
  });

  it('PUT without token keeps the saved one', async () => {
    const { agent, db, fake } = await login();
    await agent.put('/api/firefly').send({ baseUrl: 'https://ff.example.com', token: TOKEN }).expect(200);
    await agent.patch('/api/firefly').send({ assetAccountId: '1' }).expect(200);
    await agent.put('/api/firefly').send({ baseUrl: 'https://ff.example.com/', token: '' }).expect(200);
    expect(db.select().from(fireflyConnections).get()).toMatchObject({ token: TOKEN, assetAccountId: '1' });
    expect(fake.calls.filter((c) => c.path.endsWith('/about'))).toHaveLength(2);
  });

  it('a different base URL needs a new token; the saved one is never sent to another host', async () => {
    const { agent, db, fake } = await login();
    await agent.put('/api/firefly').send({ baseUrl: 'https://ff.example.com', token: TOKEN }).expect(200);
    const before = fake.calls.length;
    await agent.put('/api/firefly').send({ baseUrl: 'https://evil.example.com' }).expect(400);
    await agent.put('/api/firefly').send({ baseUrl: 'https://evil.example.com', token: '' }).expect(400);
    expect(fake.calls.length).toBe(before);
    expect(db.select().from(fireflyConnections).get()).toMatchObject({ baseUrl: 'https://ff.example.com', token: TOKEN });
  });

  it('a failed re-connect leaves the saved connection unchanged', async () => {
    const { agent, db } = await login();
    await agent.put('/api/firefly').send({ baseUrl: 'https://ff.example.com', token: TOKEN }).expect(200);
    await agent.patch('/api/firefly').send({ assetAccountId: '1' }).expect(200);
    const saved = (await agent.get('/api/firefly').expect(200)).body;
    const res = await agent.put('/api/firefly').send({ baseUrl: 'https://ff.example.com', token: 'wrong' }).expect(502);
    expect(res.body).toEqual({ error: 'firefly', message: 'unauthorized' });
    expect((await agent.get('/api/firefly').expect(200)).body).toEqual(saved);
    expect(db.select().from(fireflyConnections).get()!.token).toBe(TOKEN);
  });

  it('a different base URL starts over: links dropped, initial sync again', async () => {
    const { agent, db } = await login();
    await agent.put('/api/firefly').send({ baseUrl: 'https://ff.example.com', token: TOKEN }).expect(200);
    db.update(fireflyConnections).set({ initialSyncDone: true }).run();
    db.insert(fireflyLinks).values({ userId: 1, billId: '5', coinioHash: 'a', fireflyHash: 'b' }).run();
    await agent.put('/api/firefly').send({ baseUrl: 'https://other.example.com', token: TOKEN }).expect(200);
    expect(db.select().from(fireflyConnections).get()).toMatchObject({ baseUrl: 'https://other.example.com', token: TOKEN, initialSyncDone: false });
    expect(db.select().from(fireflyLinks).all()).toEqual([]);
  });

  it('per-subscription account: read and set through the open link', async () => {
    const { agent, db } = await login();
    await agent.put('/api/firefly').send({ baseUrl: 'https://ff.example.com', token: TOKEN }).expect(200);
    const sub = (await agent.post('/api/subscriptions').send(netflix).expect(201)).body;
    await agent.get(`/api/firefly/links/${sub.id}`).expect(404);
    await agent.put(`/api/firefly/links/${sub.id}`).send({ assetAccountId: '3' }).expect(404);
    db.insert(fireflyLinks).values({ userId: 1, subscriptionId: sub.id, billId: '5', coinioHash: 'a', fireflyHash: 'b' }).run();
    expect((await agent.get(`/api/firefly/links/${sub.id}`).expect(200)).body).toEqual({ assetAccountId: null });
    await agent.put(`/api/firefly/links/${sub.id}`).send({ assetAccountId: '3' }).expect(204);
    expect((await agent.get(`/api/firefly/links/${sub.id}`).expect(200)).body).toEqual({ assetAccountId: '3' });
    await agent.put(`/api/firefly/links/${sub.id}`).send({ assetAccountId: null }).expect(204);
    expect(db.select().from(fireflyLinks).get()!.assetAccountId).toBeNull();
  });

  it('delete removes links but keeps subscriptions', async () => {
    const { agent, db, fake } = await login();
    await agent.put('/api/firefly').send({ baseUrl: 'https://ff.example.com', token: TOKEN }).expect(200);
    const sub = (await agent.post('/api/subscriptions').send(netflix).expect(201)).body;
    const link = db.insert(fireflyLinks).values({ userId: 1, subscriptionId: sub.id, billId: '5', coinioHash: 'a', fireflyHash: 'b' }).returning().get();
    db.insert(fireflyPaymentLinks).values({ userId: 1, linkId: link.id, journalId: '7', groupId: '7' }).run();
    const before = fake.calls.length;
    await agent.delete('/api/firefly').expect(204);
    expect(db.select().from(fireflyConnections).all()).toEqual([]);
    expect(db.select().from(fireflyLinks).all()).toEqual([]);
    expect(db.select().from(fireflyPaymentLinks).all()).toEqual([]);
    expect(db.select().from(subscriptions).all()).toHaveLength(1);
    expect(fake.calls.length).toBe(before);
    expect((await agent.get('/api/firefly').expect(200)).body).toEqual({ connection: null });
  });

  it('another user cannot see the connection', async () => {
    const t = await login();
    await t.agent.put('/api/firefly').send({ baseUrl: 'https://ff.example.com', token: TOKEN }).expect(200);
    const other = addUser(t, 'other');
    expect((await other.agent.get('/api/firefly').expect(200)).body).toEqual({ connection: null });
    await other.agent.get('/api/firefly/accounts').expect(404);
    await other.agent.patch('/api/firefly').send({ enabled: false }).expect(404);
    await other.agent.delete('/api/firefly').expect(204);
    expect(t.db.select().from(fireflyConnections).all()).toHaveLength(1);
  });

  it('reconnecting after a 401 re-enables the connection', async () => {
    const { agent, db } = await login();
    await agent.put('/api/firefly').send({ baseUrl: 'https://ff.example.com', token: TOKEN }).expect(200);
    db.update(fireflyConnections).set({ enabled: false, lastError: 'unauthorized' }).run();
    await agent.put('/api/firefly').send({ baseUrl: 'https://ff.example.com', token: TOKEN }).expect(200);
    expect(db.select().from(fireflyConnections).get()).toMatchObject({ enabled: true, lastError: null });
  });

  it('excluded bill ids come back with their Firefly names', async () => {
    const { agent, fake } = await login();
    fake.bills.set('7', {
      id: '7', name: 'Netflix', amountMin: '12.99', amountMax: '12.99', currencyCode: 'EUR', date: '2026-01-05T00:00:00+01:00',
      repeatFreq: 'monthly', skip: 0, active: true, notes: null, updatedAt: '2026-11-01T00:00:00+00:00', nextExpectedMatch: null,
    });
    await agent.put('/api/firefly').send({ baseUrl: 'https://ff.example.com', token: TOKEN }).expect(200);
    const billCalls = () => fake.calls.filter((c) => c.path.startsWith('/api/v1/bills'));
    expect((await agent.get('/api/firefly').expect(200)).body.connection.excludedBills).toEqual([]);
    expect(billCalls()).toEqual([]);
    await agent.patch('/api/firefly').send({ excluded: { subscriptions: [2], bills: ['7', '8'] } }).expect(200);
    const got = await agent.get('/api/firefly').expect(200);
    expect(got.body.connection.excluded).toEqual({ subscriptions: [2], bills: ['7', '8'] });
    expect(got.body.connection.excludedBills).toEqual([{ id: '7', name: 'Netflix' }, { id: '8', name: '8' }]);
    fake.failNext(503);
    const down = await agent.get('/api/firefly').expect(200);
    expect(down.body.connection.excludedBills).toEqual([{ id: '7', name: 'Bill #7' }, { id: '8', name: 'Bill #8' }]);
  });
});

describe('firefly sync API', () => {
  const bill = { id: '7', name: 'netflix', amountMin: '12.99', amountMax: '12.99', currencyCode: 'EUR', date: '2026-01-05T00:00:00+01:00',
    repeatFreq: 'monthly' as const, skip: 0, active: true, notes: null, updatedAt: '2026-11-01T00:00:00+00:00', nextExpectedMatch: null };

  async function connected() {
    const t = await login();
    t.fake.bills.set('7', { ...bill });
    await t.agent.put('/api/firefly').send({ baseUrl: 'https://ff.example.com', token: TOKEN }).expect(200);
    const sub = (await t.agent.post('/api/subscriptions').send(netflix).expect(201)).body;
    return { ...t, sub, writes: () => t.fake.calls.filter((c) => c.method !== 'GET') };
  }

  it('nothing is written before POST /initial', async () => {
    const { agent, sub, writes } = await connected();
    const preview = await agent.get('/api/firefly/preview').expect(200);
    expect(preview.body).toEqual({ matched: [{ subscriptionId: sub.id, billId: '7', name: 'Netflix' }], toFirefly: [], toCoinio: [] });
    expect(writes()).toEqual([]);
  });

  it('POST /sync before initial answers 409', async () => {
    const { agent, writes } = await connected();
    expect((await agent.post('/api/firefly/sync').expect(409)).body).toEqual({ error: 'initial_required' });
    expect(writes()).toEqual([]);
  });

  it('POST /initial runs once, then POST /sync syncs; a disabled connection answers 409', async () => {
    const { agent, db } = await connected();
    const res = await agent.post('/api/firefly/initial').send({ unmatch: [], exclude: { subscriptions: [], bills: [] } }).expect(200);
    expect(res.body).toMatchObject({ created: { coinio: 0, firefly: 0 }, paymentsIn: 0, paymentsOut: 0 });
    expect(db.select().from(fireflyLinks).all()).toMatchObject([{ billId: '7', state: 'open' }]);
    await agent.post('/api/firefly/initial').send({ unmatch: [], exclude: { subscriptions: [], bills: [] } }).expect(409, { error: 'initial_done' });
    await agent.post('/api/firefly/initial').send({}).expect(400);
    expect((await agent.post('/api/firefly/sync').expect(200)).body).toMatchObject({ updated: { coinio: 0, firefly: 0 } });
    await agent.patch('/api/firefly').send({ enabled: false }).expect(200);
    await agent.post('/api/firefly/sync').expect(409, { error: 'disabled' });
  });

  it('a Firefly failure during sync answers 502 with its code', async () => {
    const { agent, db } = await connected();
    db.update(fireflyConnections).set({ initialSyncDone: true, token: 'stale' }).run();
    expect((await agent.post('/api/firefly/sync').expect(502)).body).toEqual({ error: 'firefly', message: 'unauthorized' });
    expect(db.select().from(fireflyConnections).get()).toMatchObject({ enabled: false, lastError: 'unauthorized' });
    await agent.post('/api/firefly/sync').expect(409);
  });

  it('a sync while one is running answers 409 busy', async () => {
    let entered = 0;
    let release = () => {};
    let hold: Promise<void> | null = null;
    const fake = fakeFirefly({ token: TOKEN, accounts });
    const inner = fake.fetch;
    const t = makeTestApp({
      fetch: (async (input: string | URL | Request, init?: RequestInit) => {
        entered++;
        await hold;
        return inner(input, init);
      }) as typeof fetch,
    });
    const agent = request.agent(t.app);
    await agent.post('/api/auth/setup').send({ username: 'y', password: 'password-123456' });
    await agent.put('/api/firefly').send({ baseUrl: 'https://ff.example.com', token: TOKEN }).expect(200);
    await agent.post('/api/firefly/initial').send({ unmatch: [], exclude: { subscriptions: [], bills: [] } }).expect(200);
    hold = new Promise<void>((r) => (release = r));
    const before = entered;
    const first = agent.post('/api/firefly/sync').expect(200).then((r) => r);
    await vi.waitFor(() => expect(entered).toBeGreaterThan(before));
    await agent.post('/api/firefly/sync').expect(409, { error: 'busy' });
    release();
    await first;
  });
});
