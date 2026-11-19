import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { fxRates, payments } from '../src/server/db/schema.js';
import { makeTestApp } from './helpers.js';

async function login() {
  const t = makeTestApp(); // now: 2026-11-18
  const agent = request.agent(t.app);
  await agent.post('/api/auth/setup').send({ username: 'yakup', password: 'correct horse battery' });
  await agent.patch('/api/settings').send({ baseCurrency: 'TRY' }); // scenarios below are priced in lira
  t.db.insert(fxRates).values({ base: 'TRY', quote: 'USD', rate: 42.5, date: '2026-11-17', fetchedAt: '2026-11-18' }).run();
  return { ...t, agent };
}

type Month = { month: string; paidMinor: number; projectedMinor: number };
const monthOf = (body: { months: Month[] }, m: string) => body.months.find((x) => x.month === m)!;

describe('reports', () => {
  it('requires a session', async () => {
    const { app } = makeTestApp();
    expect((await request(app).get('/api/reports')).status).toBe(401);
  });

  it('empty report still has 25 months', async () => {
    const { agent } = await login();
    const body = (await agent.get('/api/reports')).body;
    expect(body.base).toBe('TRY');
    expect(body.months).toHaveLength(25);
    expect(body.months.every((m: Month) => m.paidMinor === 0 && m.projectedMinor === 0)).toBe(true);
    expect(body.byCategory).toEqual([]);
    expect(body.top).toEqual([]);
    expect(body.foreignShare).toEqual({ minor: 0, percent: 0 });
  });

  it('report has 25 months and projects yearly subscription in its month', async () => {
    const { agent } = await login();
    await agent.post('/api/subscriptions').send({ name: 'Domain', amountMinor: 50000, currency: 'TRY', cycle: 'yearly', intervalCount: 1, nextDue: '2027-03-10', category: 'Web' });
    await agent.post('/api/subscriptions').send({ name: 'Music', amountMinor: 1000, currency: 'USD', cycle: 'monthly', intervalCount: 1, nextDue: '2026-11-25', category: 'Fun' });
    const body = (await agent.get('/api/reports')).body;
    expect(body.months).toHaveLength(25);
    expect(body.months[0].month).toBe('2025-11');
    expect(body.months[12].month).toBe('2026-11');
    expect(body.months[24].month).toBe('2027-11');
    expect(monthOf(body, '2027-03').projectedMinor).toBe(50000 + 42500);
    expect(monthOf(body, '2027-04').projectedMinor).toBe(42500);
    expect(monthOf(body, '2026-11').projectedMinor).toBe(42500);
    expect(monthOf(body, '2026-10').projectedMinor).toBe(0);
    // Monthly equivalents: yearly 50000/12 ≈ 4167, music 42500.
    expect(body.byCategory).toEqual([
      { category: 'Fun', monthlyMinor: 42500 },
      { category: 'Web', monthlyMinor: 4167 },
    ]);
    expect(body.top.map((t: { name: string }) => t.name)).toEqual(['Music', 'Domain']);
    expect(body.foreignShare.minor).toBe(42500);
    expect(body.foreignShare.percent).toBeCloseTo((42500 / (42500 + 4167)) * 100, 1);
  });

  it('report uses actual_base_minor when present', async () => {
    const { agent, db } = await login();
    const sub = (await agent.post('/api/subscriptions').send({ name: 'Music', amountMinor: 1000, currency: 'USD', cycle: 'monthly', intervalCount: 1, nextDue: '2026-12-25' })).body;
    const row = { subscriptionId: sub.id, amountMinor: 1000, currency: 'USD', source: 'manual' as const };
    db.insert(payments).values([
      { ...row, dueDate: '2026-09-25', paidAt: '2026-09-25T08:00:00Z', actualBaseMinor: 39000 },
      { ...row, dueDate: '2026-10-25', paidAt: '2026-10-25T08:00:00Z' },
      { ...row, dueDate: '2026-11-25', paidAt: '2026-11-18T08:00:00Z', actualBaseMinor: 43000 },
    ]).run();
    const body = (await agent.get('/api/reports')).body;
    expect(monthOf(body, '2026-09').paidMinor).toBe(39000);
    expect(monthOf(body, '2026-10').paidMinor).toBe(42500);
    // Current month: paid filled, and the paid due date is not projected again.
    expect(monthOf(body, '2026-11')).toMatchObject({ paidMinor: 43000, projectedMinor: 0 });
    expect(monthOf(body, '2026-12').projectedMinor).toBe(42500);
  });

  it('skipped and void payments excluded from report', async () => {
    const { agent, db } = await login();
    const sub = (await agent.post('/api/subscriptions').send({ name: 'Box', amountMinor: 20000, currency: 'TRY', cycle: 'monthly', intervalCount: 1, nextDue: '2026-11-28' })).body;
    const row = { subscriptionId: sub.id, amountMinor: 20000, currency: 'TRY', source: 'auto' as const };
    db.insert(payments).values([
      { ...row, dueDate: '2026-08-28', paidAt: '2026-08-28T08:00:00Z', status: 'void' as const },
      { ...row, dueDate: '2026-09-28', paidAt: '2026-09-28T08:00:00Z', status: 'skipped' as const, amountMinor: 0 },
      { ...row, dueDate: '2026-10-28', paidAt: '2026-10-28T08:00:00Z' },
    ]).run();
    await agent.post(`/api/subscriptions/${sub.id}/skip`).send({}); // skips 2026-11-28
    const body = (await agent.get('/api/reports')).body;
    expect(monthOf(body, '2026-08').paidMinor).toBe(0);
    expect(monthOf(body, '2026-09').paidMinor).toBe(0);
    expect(monthOf(body, '2026-10').paidMinor).toBe(20000);
    expect(monthOf(body, '2026-11')).toMatchObject({ paidMinor: 0, projectedMinor: 0 });
    expect(monthOf(body, '2026-12').projectedMinor).toBe(20000);
  });

  it('lists subscriptions left out for lack of a rate', async () => {
    const { agent } = await login();
    const gbp = (await agent.post('/api/subscriptions').send({ name: 'BBC', amountMinor: 999, currency: 'GBP', cycle: 'monthly', intervalCount: 1, nextDue: '2026-11-25' })).body;
    const body = (await agent.get('/api/reports')).body;
    expect(body.unconvertible).toEqual([gbp.id]);
    expect(typeof body.ratesStale).toBe('boolean');
  });
});
