import request from 'supertest';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { instanceSettings, payments, settings, subscriptions, users } from '../src/server/db/schema.js';
import { startScheduler } from '../src/server/scheduler.js';
import { runAutoPay } from '../src/server/services/autopay.js';
import type { ServiceCtx } from '../src/server/services/context.js';
import * as autopay from '../src/server/services/autopay.js';
import { skipPayment, undoPayment } from '../src/server/services/subscriptions.js';
import { makeTestApp } from './helpers.js';

afterEach(() => vi.useRealTimers());

function setup(now = '2026-11-18T09:00:00Z') {
  const t = makeTestApp({ now: new Date(now) });
  const ctx: ServiceCtx = { db: t.db, config: t.config, fetch, now: () => t.clock.now };
  const user = t.db.insert(users).values({ username: 'y', passwordHash: 'x', createdAt: now }).returning().get();
  t.db.insert(settings).values({ userId: user.id, key: 'baseCurrency', value: 'TRY' }).run(); // scenarios below are priced in lira
  const add = (over: Partial<typeof subscriptions.$inferInsert> = {}) =>
    t.db
      .insert(subscriptions)
      .values({
        userId: user.id, name: 'Netflix', amountMinor: 19999, currency: 'TRY', cycle: 'monthly', intervalCount: 1,
        anchorDay: 9, nextDue: '2026-08-09', createdAt: now, updatedAt: now, ...over,
      })
      .returning()
      .get();
  const sub = (id: number) => t.db.select().from(subscriptions).where(eq(subscriptions.id, id)).get()!;
  return { ...t, ctx, user, add, sub };
}

describe('runAutoPay', () => {
  it('autopay does not reopen a skipped due date', () => {
    const { ctx, db, add, sub, user } = setup();
    const s = add({ nextDue: '2026-11-09' });
    skipPayment(ctx, user.id, s.id, { now: ctx.now() });
    expect(sub(s.id).nextDue).toBe('2026-12-09');
    expect(runAutoPay(ctx)).toBe(0);
    const rows = db.select().from(payments).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('skipped');
  });

  it('catches up missed periods once', () => {
    const { ctx, db, add, sub } = setup();
    const s = add();
    expect(runAutoPay(ctx)).toBe(4);
    const rows = db.select().from(payments).all();
    expect(rows.map((r) => r.dueDate).sort()).toEqual(['2026-08-09', '2026-09-09', '2026-10-09', '2026-11-09']);
    expect(rows.every((r) => r.source === 'auto' && r.status === 'paid' && r.amountMinor === 19999 && r.currency === 'TRY')).toBe(true);
    expect(sub(s.id).nextDue).toBe('2026-12-09');
    expect(runAutoPay(ctx)).toBe(0);
  });

  it('does not touch auto_pay=0 subscriptions', () => {
    const { ctx, db, add, sub } = setup();
    const s = add({ autoPay: false });
    expect(runAutoPay(ctx)).toBe(0);
    expect(db.select().from(payments).all()).toHaveLength(0);
    expect(sub(s.id).nextDue).toBe('2026-08-09');
  });

  it('does not touch inactive subscriptions', () => {
    const { ctx, db, add, sub } = setup();
    const s = add({ active: false });
    expect(runAutoPay(ctx)).toBe(0);
    expect(db.select().from(payments).all()).toHaveLength(0);
    expect(sub(s.id).nextDue).toBe('2026-08-09');
  });

  it('does not reopen an auto payment that was undone', () => {
    const { ctx, db, add, sub, user } = setup();
    const s = add({ nextDue: '2026-11-09' });
    expect(runAutoPay(ctx)).toBe(1);
    const p = db.select().from(payments).get()!;
    undoPayment(ctx, user.id, p.id);
    expect(db.select().from(payments).get()!.status).toBe('void');
    expect(sub(s.id).nextDue).toBe('2026-12-09');
    expect(runAutoPay(ctx)).toBe(0);
    expect(db.select().from(payments).get()!.status).toBe('void');
    expect(sub(s.id).nextDue).toBe('2026-12-09');
  });

  it('uses configured timezone for today', () => {
    const { ctx, db, add, user } = setup('2026-11-18T21:30:00Z');
    db.insert(settings).values({ userId: user.id, key: 'timezone', value: 'Europe/Istanbul' }).run();
    add({ nextDue: '2026-11-19', anchorDay: 19 });
    expect(runAutoPay(ctx)).toBe(1);
    expect(db.select().from(payments).get()!.dueDate).toBe('2026-11-19');
  });
});

describe('startScheduler', () => {
  it('fetches the rate for a currency added after today\'s refresh, once', async () => {
    vi.useFakeTimers();
    const { ctx, add } = setup();
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ date: '2026-11-17', rates: { TRY: 40 } }) }));
    const stop = startScheduler({ ...ctx, fetch: f as unknown as typeof fetch }, { intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(f).toHaveBeenCalledTimes(0);
    add({ currency: 'USD', nextDue: '2026-12-01' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(f).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(f).toHaveBeenCalledTimes(1);
    stop();
  });

  it('runs immediately, then on interval, refreshes fx once per day, and stops', async () => {
    vi.useFakeTimers();
    const { ctx, db, add } = setup();
    add({ currency: 'USD', nextDue: '2026-12-01' });
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ date: '2026-11-17', rates: { TRY: 40 } }) }));
    const onTick = vi.fn(async () => {});
    const stop = startScheduler({ ...ctx, fetch: f as unknown as typeof fetch }, { intervalMs: 1000, onTick });
    await vi.advanceTimersByTimeAsync(0);
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledTimes(1);
    expect(db.select().from(instanceSettings).where(eq(instanceSettings.key, 'lastFxDate')).get()?.value).toBe('2026-11-18');
    await vi.advanceTimersByTimeAsync(2000);
    expect(onTick).toHaveBeenCalledTimes(3);
    expect(f).toHaveBeenCalledTimes(1);
    stop();
    await vi.advanceTimersByTimeAsync(3000);
    expect(onTick).toHaveBeenCalledTimes(3);
  });

  it('keeps lastFxDate out of GET /api/settings', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { app, db, config, clock } = makeTestApp();
    const agent = request.agent(app);
    await agent.post('/api/auth/setup').send({ username: 'yakup', password: 'correct horse battery' });
    const ctx: ServiceCtx = { db, config, fetch, now: () => clock.now };
    const stop = startScheduler(ctx);
    await vi.waitFor(() => expect(db.select().from(instanceSettings).where(eq(instanceSettings.key, 'lastFxDate')).get()).toBeTruthy());
    stop();
    vi.useRealTimers();
    const res = await agent.get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('lastFxDate');
  });

  it('still runs onTick when the autopay step throws', async () => {
    vi.useFakeTimers();
    const { ctx } = setup();
    vi.spyOn(autopay, 'runAutoPay').mockImplementation(() => { throw new Error('db locked'); });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onTick = vi.fn(async () => {});
    const stop = startScheduler(ctx, { intervalMs: 1000, onTick });
    await vi.advanceTimersByTimeAsync(0);
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalled();
    stop();
  });

  it('survives a failing tick', async () => {
    vi.useFakeTimers();
    const { ctx } = setup();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onTick = vi.fn(async () => { throw new Error('boom'); });
    const stop = startScheduler(ctx, { intervalMs: 1000, onTick });
    await vi.advanceTimersByTimeAsync(1000);
    expect(onTick).toHaveBeenCalledTimes(2);
    expect(err).toHaveBeenCalled();
    stop();
  });
});
