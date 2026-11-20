import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { principal, requireBearer } from '../src/server/auth/middleware.js';
import { makeTestApp } from './helpers.js';

async function setup() {
  const t = makeTestApp();
  const agent = request.agent(t.app);
  await agent.post('/api/auth/setup').send({ username: 'yakup', password: 'correct horse battery' });
  await agent.patch('/api/settings').send({ baseCurrency: 'TRY' }); // scenarios below are priced in lira
  const key = async (scope: 'read' | 'full') => (await agent.post('/api/keys').send({ name: scope, scope })).body.key as string;
  return { ...t, agent, key };
}

describe('widget', () => {
  it('returns 200 with a read key', async () => {
    const { app, key } = await setup();
    const res = await request(app).get('/api/widget').set('Authorization', `Bearer ${await key('read')}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ base: 'TRY', leftThisMonthMinor: 0, monthlyAverageMinor: 0, items: [], generatedAt: '2026-11-18T09:00:00.000Z' });
    expect(typeof res.body.ratesStale).toBe('boolean');
  });

  it('lists overdue first then upcoming, capped at 6', async () => {
    const { app, agent, key } = await setup();
    const mk = (name: string, nextDue: string) =>
      agent.post('/api/subscriptions').send({ name, amountMinor: 1000, currency: 'TRY', cycle: 'monthly', intervalCount: 1, nextDue, autoPay: false });
    await mk('late', '2026-11-10');
    for (let i = 0; i < 7; i++) await mk(`s${i}`, `2026-11-${20 + i}`);
    const res = await request(app).get('/api/widget').set('Authorization', `Bearer ${await key('read')}`);
    expect(res.body.items).toHaveLength(6);
    expect(res.body.items[0].name).toBe('late');
    expect(res.body.items[1].name).toBe('s0');
  });

  it('tells the decimal places of each currency in the payload', async () => {
    const { app, agent, key } = await setup();
    await agent.post('/api/subscriptions').send({ name: 'Netflix JP', amountMinor: 1590, currency: 'JPY', cycle: 'monthly', intervalCount: 1, nextDue: '2026-11-20' });
    const res = await request(app).get('/api/widget').set('Authorization', `Bearer ${await key('read')}`);
    expect(res.body.items[0]).toMatchObject({ amountMinor: 1590, currency: 'JPY' });
    expect(res.body.digits).toEqual({ TRY: 2, JPY: 0 });
  });

  it('rejects missing and malformed Authorization with 401', async () => {
    const { app } = await setup();
    expect((await request(app).get('/api/widget')).status).toBe(401);
    for (const h of ['Bearer', 'Bearer ', 'Basic abc', 'garbage', 'Bearer a b', 'Bearer coi_read_nope']) {
      const res = await request(app).get('/api/widget').set('Authorization', h);
      expect(res.status, h).toBe(401);
    }
  });

  it('enforces scopes: full satisfies read, read fails full', async () => {
    const t = await setup();
    const c = { db: t.db, config: t.config, fetch, now: () => t.clock.now };
    const app = express();
    app.get('/r', requireBearer(c, ['read']), (req, res) => res.json(principal(req)));
    app.get('/f', requireBearer(c, ['full']), (req, res) => res.json(principal(req)));
    const read = await t.key('read');
    const full = await t.key('full');
    const get = (path: string, k: string) => request(app).get(path).set('Authorization', `Bearer ${k}`);
    expect((await get('/r', read)).body).toMatchObject({ userId: 1, scope: 'read', via: 'apikey' });
    expect((await get('/r', full)).status).toBe(200);
    expect((await get('/f', full)).status).toBe(200);
    const denied = await get('/f', read);
    expect(denied.status).toBe(403);
    expect(denied.body).toEqual({ error: 'insufficient_scope' });
  });
});
