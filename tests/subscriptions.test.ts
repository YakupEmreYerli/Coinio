import request from 'supertest';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { fxRates, payments, subscriptions, users } from '../src/server/db/schema.js';
import { makeTestApp } from './helpers.js';

async function login(t = makeTestApp(), base: string | null = 'TRY') {
  const agent = request.agent(t.app);
  await agent.post('/api/auth/setup').send({ username: 'yakup', password: 'correct horse battery' });
  if (base) await agent.patch('/api/settings').send({ baseCurrency: base }); // scenarios below are priced in lira
  return { ...t, agent };
}

const netflix = { name: 'Netflix', amountMinor: 19999, currency: 'TRY', cycle: 'monthly', intervalCount: 1, nextDue: '2026-12-31' };

describe('subscriptions REST', () => {
  it('requires a session', async () => {
    const { app } = makeTestApp();
    expect((await request(app).get('/api/subscriptions')).status).toBe(401);
    expect((await request(app).get('/api/settings')).status).toBe(401);
  });

  it('creates with anchorDay derived from nextDue and defaults', async () => {
    const { agent } = await login();
    const res = await agent.post('/api/subscriptions').send(netflix);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ anchorDay: 31, nextDue: '2026-12-31', autoPay: true, variableAmount: false, reminderOffsets: null, trialEndsAt: null, active: true });
    expect((await agent.get('/api/subscriptions')).body).toHaveLength(1);
  });

  it('normalizes domain: trims, lowercases, empty clears', async () => {
    const { agent } = await login();
    const created = await agent.post('/api/subscriptions').send({ ...netflix, domain: '  Netflix.COM ' });
    expect(created.body.domain).toBe('netflix.com');
    const blank = await agent.post('/api/subscriptions').send({ ...netflix, domain: '' });
    expect(blank.status).toBe(201);
    expect(blank.body.domain).toBeNull();
    const cleared = await agent.patch(`/api/subscriptions/${created.body.id}`).send({ domain: '   ' });
    expect(cleared.status).toBe(200);
    expect(cleared.body.domain).toBeNull();
  });

  it('rejects invalid input with 400 validation', async () => {
    const { agent } = await login();
    for (const bad of [
      { ...netflix, amountMinor: -1 },
      { ...netflix, currency: 'ABC' },
      { ...netflix, currency: 'try' },
      { ...netflix, currency: 'XXX' },
      { ...netflix, nextDue: '2026-02-30' },
      { ...netflix, name: '' },
      { ...netflix, intervalCount: 37 },
    ]) {
      const res = await agent.post('/api/subscriptions').send(bad);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('validation');
      expect(res.body.issues.length).toBeGreaterThan(0);
    }
  });

  it('round-trips a yen subscription in whole yen and converts it into the base currency', async () => {
    const t = makeTestApp();
    const { agent } = await login(t, 'USD');
    const created = await agent.post('/api/subscriptions').send({ ...netflix, name: 'Netflix JP', amountMinor: 1590, currency: 'JPY' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ amountMinor: 1590, currency: 'JPY' });
    expect((await agent.get(`/api/subscriptions/${created.body.id}`)).body).toMatchObject({ amountMinor: 1590, currency: 'JPY' });
    expect((await agent.patch('/api/settings').send({ baseCurrency: 'KRW' })).status).toBe(200);
    expect((await agent.patch('/api/settings').send({ baseCurrency: 'USD' })).status).toBe(200);
    // 1 JPY = 0.0065 USD: ¥1,590 a month is $10.34.
    t.db.insert(fxRates).values({ base: 'USD', quote: 'JPY', rate: 0.0065, date: '2026-11-18', fetchedAt: '2026-11-18' }).run();
    expect((await agent.get('/api/summary')).body.monthlyAverageMinor).toBe(1034);
  });

  it('pay advances nextDue, is idempotent per due date, undo rolls back', async () => {
    const { agent } = await login();
    const sub = (await agent.post('/api/subscriptions').send(netflix)).body;
    const p1 = await agent.post(`/api/subscriptions/${sub.id}/pay`).send({});
    expect(p1.status).toBe(201);
    expect(p1.body).toMatchObject({ dueDate: '2026-12-31', amountMinor: 19999, source: 'manual', status: 'paid' });
    expect((await agent.get(`/api/subscriptions/${sub.id}`)).body.nextDue).toBe('2027-01-31');

    const p2 = await agent.post(`/api/subscriptions/${sub.id}/pay`).send({ dueDate: '2026-12-31' });
    expect(p2.body.id).toBe(p1.body.id);
    expect((await agent.get(`/api/payments?subscriptionId=${sub.id}`)).body).toHaveLength(1);
    expect((await agent.get(`/api/subscriptions/${sub.id}`)).body.nextDue).toBe('2027-01-31');

    expect((await agent.delete(`/api/payments/${p1.body.id}`)).status).toBe(204);
    expect((await agent.get(`/api/subscriptions/${sub.id}`)).body.nextDue).toBe('2026-12-31');
    expect((await agent.get(`/api/payments?subscriptionId=${sub.id}`)).body).toHaveLength(0);
  });

  it('stores actualBaseMinor for variable amount and corrects it via PATCH', async () => {
    const { agent } = await login();
    const sub = (await agent.post('/api/subscriptions').send({ ...netflix, currency: 'USD', amountMinor: 1000, variableAmount: true })).body;
    const pay = await agent.post(`/api/subscriptions/${sub.id}/pay`).send({ amountMinor: 1100, actualBaseMinor: 48000 });
    expect(pay.body).toMatchObject({ amountMinor: 1100, actualBaseMinor: 48000 });
    const patched = await agent.patch(`/api/payments/${pay.body.id}`).send({ actualBaseMinor: 49500 });
    expect(patched.body.actualBaseMinor).toBe(49500);
    expect((await agent.patch(`/api/payments/${pay.body.id}`).send({ actualBaseMinor: -5 })).status).toBe(400);
  });

  it('undo of an auto payment voids it, keeps the row and leaves nextDue', async () => {
    const { agent, db } = await login();
    const sub = (await agent.post('/api/subscriptions').send(netflix)).body;
    db.update(subscriptions).set({ nextDue: '2027-01-31' }).where(eq(subscriptions.id, sub.id)).run();
    const pay = db
      .insert(payments)
      .values({ subscriptionId: sub.id, dueDate: '2026-12-31', paidAt: '2026-12-31T00:00:00Z', amountMinor: 19999, currency: 'TRY', source: 'auto' })
      .returning()
      .get();
    expect((await agent.delete(`/api/payments/${pay.id}`)).status).toBe(204);
    const row = db.select().from(payments).where(eq(payments.id, pay.id)).get();
    expect(row?.status).toBe('void');
    expect((await agent.get(`/api/subscriptions/${sub.id}`)).body.nextDue).toBe('2027-01-31');
  });

  it('paying a due date that has a void payment flips it back to paid', async () => {
    const { agent, db } = await login();
    const sub = (await agent.post('/api/subscriptions').send(netflix)).body;
    const void_ = db
      .insert(payments)
      .values({ subscriptionId: sub.id, dueDate: '2026-12-31', paidAt: '2026-12-31T00:00:00Z', amountMinor: 19999, currency: 'TRY', source: 'auto', status: 'void' })
      .returning()
      .get();
    const res = await agent.post(`/api/subscriptions/${sub.id}/pay`).send({});
    expect(res.body).toMatchObject({ id: void_.id, status: 'paid', source: 'auto' });
    expect(db.select().from(payments).all()).toHaveLength(1);
    // undoing it again still voids (auto) instead of deleting
    await agent.delete(`/api/payments/${void_.id}`);
    expect(db.select().from(payments).get()?.status).toBe('void');
  });

  it('manual undo with a later payment leaves next_due unchanged', async () => {
    const { agent } = await login();
    const sub = (await agent.post('/api/subscriptions').send(netflix)).body;
    const p1 = (await agent.post(`/api/subscriptions/${sub.id}/pay`).send({})).body;
    await agent.post(`/api/subscriptions/${sub.id}/pay`).send({});
    expect((await agent.get(`/api/subscriptions/${sub.id}`)).body.nextDue).toBe('2027-02-28');
    await agent.delete(`/api/payments/${p1.id}`);
    expect((await agent.get(`/api/subscriptions/${sub.id}`)).body.nextDue).toBe('2027-02-28');
    expect((await agent.get(`/api/payments?subscriptionId=${sub.id}`)).body).toHaveLength(1);
  });

  it('hides other users records behind 404', async () => {
    const { agent, db } = await login();
    const other = db.insert(users).values({ username: 'other', passwordHash: 'x', createdAt: 'a' }).returning().get();
    const sub = db
      .insert(subscriptions)
      .values({ userId: other.id, name: 'x', amountMinor: 1, currency: 'TRY', cycle: 'monthly', anchorDay: 1, nextDue: '2026-12-01', createdAt: 'a', updatedAt: 'a' })
      .returning()
      .get();
    const pay = db
      .insert(payments)
      .values({ subscriptionId: sub.id, dueDate: '2026-11-01', paidAt: 'a', amountMinor: 1, currency: 'TRY', source: 'manual' })
      .returning()
      .get();
    expect((await agent.get(`/api/subscriptions/${sub.id}`)).status).toBe(404);
    expect((await agent.patch(`/api/subscriptions/${sub.id}`).send({ name: 'y' })).status).toBe(404);
    expect((await agent.delete(`/api/subscriptions/${sub.id}`)).status).toBe(404);
    expect((await agent.post(`/api/subscriptions/${sub.id}/pay`).send({})).status).toBe(404);
    expect((await agent.patch(`/api/payments/${pay.id}`).send({ status: 'void' })).status).toBe(404);
    expect((await agent.delete(`/api/payments/${pay.id}`)).status).toBe(404);
    expect((await agent.get('/api/subscriptions')).body).toEqual([]);
  });

  it('PATCH recomputes anchorDay when nextDue changes; DELETE removes', async () => {
    const { agent } = await login();
    const sub = (await agent.post('/api/subscriptions').send(netflix)).body;
    const res = await agent.patch(`/api/subscriptions/${sub.id}`).send({ nextDue: '2026-12-15', active: false });
    expect(res.body).toMatchObject({ anchorDay: 15, nextDue: '2026-12-15', active: false });
    expect((await agent.get('/api/subscriptions')).body).toHaveLength(0);
    expect((await agent.get('/api/subscriptions?includeInactive=true')).body).toHaveLength(1);
    expect((await agent.delete(`/api/subscriptions/${sub.id}`)).status).toBe(204);
    expect((await agent.get(`/api/subscriptions/${sub.id}`)).status).toBe(404);
  });

  it('returns the Task 4 summary shape', async () => {
    const { agent } = await login();
    await agent.post('/api/subscriptions').send({ ...netflix, nextDue: '2026-11-20' });
    const res = await agent.get('/api/summary');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ base: 'TRY', leftThisMonthMinor: 19999, monthlyAverageMinor: 19999, yearlyTotalMinor: 239988, overdue: [], paidThisMonth: [], unconvertible: [], ratesStale: false });
    expect(res.body.upcoming[0]).toMatchObject({ name: 'Netflix', dueDate: '2026-11-20', daysLeft: 2 });
  });
});

describe('settings REST', () => {
  it('returns defaults, patches, and ignores the old Telegram fields (now notification channels)', async () => {
    const { agent } = await login(makeTestApp(), null);
    expect((await agent.get('/api/settings')).body).toEqual({
      baseCurrency: 'USD', timezone: 'UTC', locale: 'en', reminderTime: '09:00',
    });
    const res = await agent.patch('/api/settings').send({ locale: 'tr', telegramBotToken: '123456:ABCDEFwxyz', telegramChatId: '42' });
    expect(res.body).toEqual({ baseCurrency: 'USD', timezone: 'UTC', locale: 'tr', reminderTime: '09:00' });
    for (const bad of [{ timezone: 'Mars/Base' }, { reminderTime: '25:00' }, { baseCurrency: 'ABC' }, { locale: 'ko' }]) {
      expect((await agent.patch('/api/settings').send(bad)).status).toBe(400);
    }
  });
});

describe('skip and resume', () => {
  it('skip advances next_due and records skipped payment', async () => {
    const { agent } = await login();
    const sub = (await agent.post('/api/subscriptions').send(netflix)).body;
    const res = await agent.post(`/api/subscriptions/${sub.id}/skip`).send({});
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ dueDate: '2026-12-31', status: 'skipped', amountMinor: 0 });
    expect((await agent.get(`/api/subscriptions/${sub.id}`)).body.nextDue).toBe('2027-01-31');
  });

  it('undo skip restores next_due', async () => {
    const { agent } = await login();
    const sub = (await agent.post('/api/subscriptions').send(netflix)).body;
    const skip = (await agent.post(`/api/subscriptions/${sub.id}/skip`).send({})).body;
    expect((await agent.delete(`/api/payments/${skip.id}`)).status).toBe(204);
    expect((await agent.get(`/api/subscriptions/${sub.id}`)).body.nextDue).toBe('2026-12-31');
    expect((await agent.get(`/api/payments?subscriptionId=${sub.id}`)).body).toHaveLength(0);
  });

  it('skipped payment is excluded from summary totals and paidThisMonth', async () => {
    const { agent } = await login();
    const sub = (await agent.post('/api/subscriptions').send({ ...netflix, nextDue: '2026-11-20' })).body;
    const before = (await agent.get('/api/summary')).body;
    expect(before.leftThisMonthMinor).toBe(19999);
    await agent.post(`/api/subscriptions/${sub.id}/skip`).send({});
    const after = (await agent.get('/api/summary')).body;
    expect(after.leftThisMonthMinor).toBe(0);
    expect(after.paidThisMonth).toHaveLength(0);
    expect(after.upcoming.some((i: { dueDate: string }) => i.dueDate === '2026-11-20')).toBe(false);
  });

  it('PATCH payment cannot set status skipped', async () => {
    const { agent } = await login();
    const sub = (await agent.post('/api/subscriptions').send(netflix)).body;
    const pay = (await agent.post(`/api/subscriptions/${sub.id}/pay`).send({})).body;
    expect((await agent.patch(`/api/payments/${pay.id}`).send({ status: 'skipped' })).status).toBe(400);
  });

  it('resume moves next_due to first due on or after today', async () => {
    const { agent } = await login();
    const sub = (await agent.post('/api/subscriptions').send({ ...netflix, nextDue: '2026-08-09', autoPay: false })).body;
    await agent.patch(`/api/subscriptions/${sub.id}`).send({ active: false });
    const resumed = await agent.patch(`/api/subscriptions/${sub.id}`).send({ active: true });
    expect(resumed.body.nextDue).toBe('2026-12-09');
    expect((await agent.get('/api/summary')).body.overdue).toHaveLength(0);
  });

  it('resume keeps explicit nextDue from same patch', async () => {
    const { agent } = await login();
    const sub = (await agent.post('/api/subscriptions').send({ ...netflix, nextDue: '2026-08-09' })).body;
    await agent.patch(`/api/subscriptions/${sub.id}`).send({ active: false });
    const resumed = await agent.patch(`/api/subscriptions/${sub.id}`).send({ active: true, nextDue: '2026-11-25' });
    expect(resumed.body.nextDue).toBe('2026-11-25');
  });
});

describe('payments filter', () => {
  it('payments filtered by date range inclusive', async () => {
    const { agent, db } = await login();
    const sub = (await agent.post('/api/subscriptions').send(netflix)).body;
    const row = (dueDate: string, over: Partial<typeof payments.$inferInsert> = {}) => ({
      subscriptionId: sub.id, dueDate, paidAt: `${dueDate}T08:00:00Z`, amountMinor: 19999, currency: 'TRY', source: 'manual' as const, ...over,
    });
    db.insert(payments).values([
      row('2026-08-31'),
      row('2026-09-30', { source: 'auto' }),
      row('2026-10-31', { status: 'skipped', amountMinor: 0 }),
      row('2026-11-30'),
    ]).run();
    const dates = async (q: string) =>
      ((await agent.get(`/api/payments?${q}`)).body as { dueDate: string }[]).map((p) => p.dueDate);
    expect(await dates('from=2026-09-30&to=2026-10-31')).toEqual(['2026-10-31', '2026-09-30']);
    expect(await dates('from=2026-10-01')).toEqual(['2026-11-30', '2026-10-31']);
    expect(await dates('to=2026-08-31')).toEqual(['2026-08-31']);
    expect(await dates('source=auto')).toEqual(['2026-09-30']);
    expect(await dates('status=skipped')).toEqual(['2026-10-31']);
    expect((await agent.get('/api/payments?from=2026-13-01')).status).toBe(400);
    expect((await agent.get('/api/payments?status=gone')).status).toBe(400);
  });

  it('resume from the edit form (same nextDue sent back) still skips missed periods', async () => {
    const { agent } = await login();
    const sub = (await agent.post('/api/subscriptions').send({ ...netflix, nextDue: '2026-08-09', autoPay: false })).body;
    await agent.patch(`/api/subscriptions/${sub.id}`).send({ active: false });
    const resumed = await agent.patch(`/api/subscriptions/${sub.id}`).send({ active: true, nextDue: '2026-08-09', name: 'Netflix' });
    expect(resumed.body.nextDue).toBe('2026-12-09');
  });

  it('paying the next due steps over a later date that was already skipped', async () => {
    const { agent } = await login();
    const sub = (await agent.post('/api/subscriptions').send({ ...netflix, nextDue: '2026-11-30', anchorDay: 30 })).body;
    await agent.post(`/api/subscriptions/${sub.id}/skip`).send({ dueDate: '2026-12-30' });
    expect((await agent.get(`/api/subscriptions/${sub.id}`)).body.nextDue).toBe('2026-11-30');
    const paid = await agent.post(`/api/subscriptions/${sub.id}/pay`).send({});
    expect(paid.body).toMatchObject({ dueDate: '2026-11-30', status: 'paid' });
    expect((await agent.get(`/api/subscriptions/${sub.id}`)).body.nextDue).toBe('2027-01-30');
  });
});
