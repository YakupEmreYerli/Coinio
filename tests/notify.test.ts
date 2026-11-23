import { describe, expect, it, vi } from 'vitest';
import { notificationChannels, notificationLog, settings, subscriptions, users } from '../src/server/db/schema.js';
import type { ServiceCtx } from '../src/server/services/context.js';
import { notifyPriceChange, planToday, runNotifications } from '../src/server/services/notify/index.js';
import { planNotifications } from '../src/server/services/notify/plan.js';
import { BACKOFF_MINUTES, deliverQueued, MAX_ATTEMPTS } from '../src/server/services/notify/queue.js';
import { saveNotifySettings, saveTemplate } from '../src/server/services/notify/store.js';
import { markPaid, updateSubscription } from '../src/server/services/subscriptions.js';
import { computeSummary, type SubscriptionRow } from '../src/server/domain/summary.js';
import { DEFAULT_NOTIFY_SETTINGS, type NotifySettings } from '../src/shared/notify/types.js';
import { makeTestApp } from './helpers.js';

const NOW = '2026-11-18T09:00:00Z'; // 12:00 in Istanbul

function setup(opts: { now?: string; status?: number; tz?: string; locale?: string } = {}) {
  const t = makeTestApp({ now: new Date(opts.now ?? NOW) });
  let status = opts.status ?? 200;
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(status < 400 ? '{"ok":true}' : '{"description":"nope"}', { status }));
  const ctx: ServiceCtx = { db: t.db, config: t.config, fetch: fetchMock as unknown as typeof fetch, now: () => t.clock.now };
  const user = t.db.insert(users).values({ username: 'y', passwordHash: 'x', createdAt: NOW }).returning().get();
  t.db.insert(settings).values([
    { userId: user.id, key: 'locale', value: opts.locale ?? 'en' },
    { userId: user.id, key: 'timezone', value: opts.tz ?? 'Europe/Istanbul' },
    { userId: user.id, key: 'baseCurrency', value: 'TRY' },
  ]).run();
  const channel = (over: Partial<typeof notificationChannels.$inferInsert> = {}) =>
    t.db.insert(notificationChannels).values({
      userId: user.id, type: 'slack', name: 'Slack', enabled: true, config: {}, secrets: { webhookUrl: 'https://slack.test/hook' }, createdAt: NOW, updatedAt: NOW, ...over,
    }).returning().get();
  const add = (over: Partial<typeof subscriptions.$inferInsert>) =>
    t.db.insert(subscriptions).values({
      userId: user.id, name: 'X', amountMinor: 9999, currency: 'TRY', cycle: 'monthly', intervalCount: 1,
      anchorDay: 1, nextDue: '2026-12-01', autoPay: false, createdAt: NOW, updatedAt: NOW, ...over,
    }).returning().get();
  const sentTexts = () => fetchMock.mock.calls.map((c) => (JSON.parse(c[1].body as string) as { text: string }).text);
  const log = () => t.db.select().from(notificationLog).orderBy(notificationLog.id).all();
  return { ...t, ctx, user, add, channel, fetchMock, sentTexts, log, setStatus: (s: number) => (status = s) };
}

const settingsWith = (over: Partial<NotifySettings>): NotifySettings => ({ ...DEFAULT_NOTIFY_SETTINGS, ...over });

function sub(over: Partial<SubscriptionRow>): SubscriptionRow {
  return {
    id: 1, userId: 1, householdId: null, paidByMemberId: null, name: 'S', domain: null, logoPath: null, amountMinor: 1000, currency: 'USD', variableAmount: false, cycle: 'monthly',
    intervalCount: 1, anchorDay: 1, nextDue: '2026-12-01', autoPay: true, paymentMethod: null, category: null, notes: null,
    reminderOffsets: null, trialEndsAt: null, active: true, createdAt: '', updatedAt: '', ...over,
  };
}

function plan(subs: SubscriptionRow[], today: string, s: NotifySettings = DEFAULT_NOTIFY_SETTINGS) {
  const summary = computeSummary({ subs, payments: [], today, rates: { base: 'USD', date: today, stale: false, rates: {} } });
  return planNotifications({ today, settings: s, subs, summary, autoPaidToday: [] });
}

describe('planNotifications', () => {
  it('uses the cycle defaults: 3 and 1 days for monthly, 30, 7 and 1 for yearly', () => {
    const subs = [sub({ id: 1, nextDue: '2026-12-01', anchorDay: 1 }), sub({ id: 2, cycle: 'yearly', nextDue: '2026-12-28', anchorDay: 28 })];
    expect(plan(subs, '2026-11-28').map((e) => e.key)).toEqual(['reminder:1:2026-12-01:3', 'reminder:2:2026-12-28:30']);
    expect(plan(subs, '2026-11-29').map((e) => e.key)).toEqual([]);
    expect(plan(subs, '2026-11-30').map((e) => e.key)).toEqual(['reminder:1:2026-12-01:1']);
    expect(plan(subs, '2026-12-21').map((e) => e.key)).toEqual(['reminder:2:2026-12-28:7']);
  });

  it('a subscription list replaces the defaults; 0 is the due day', () => {
    const s = sub({ reminderOffsets: [5, 0] });
    expect(plan([s], '2026-11-30')).toEqual([]);
    expect(plan([s], '2026-11-26').map((e) => e.key)).toEqual(['reminder:1:2026-12-01:5']);
    expect(plan([s], '2026-12-01').map((e) => [e.type, e.key])).toEqual([['dueToday', 'dueToday:1:2026-12-01:0']]);
  });

  it('follows clamped month ends: Jan 31 anchor is due Feb 28', () => {
    const s = sub({ nextDue: '2027-02-28', anchorDay: 31 });
    expect(plan([s], '2027-02-25').map((e) => e.key)).toEqual(['reminder:1:2027-02-28:3']);
    const after = sub({ nextDue: '2027-03-31', anchorDay: 31 });
    expect(plan([after], '2027-03-30').map((e) => e.key)).toEqual(['reminder:1:2027-03-31:1']);
  });

  it('alerts overdue manual payments in the days after, never auto-pay', () => {
    const manual = sub({ id: 1, autoPay: false, nextDue: '2026-11-17', anchorDay: 17 });
    const old = sub({ id: 2, autoPay: false, nextDue: '2026-11-01', anchorDay: 1 });
    const auto = sub({ id: 3, autoPay: true, nextDue: '2026-11-17', anchorDay: 17 });
    expect(plan([manual, old, auto], '2026-11-18').filter((e) => e.type === 'overdue').map((e) => e.key)).toEqual(['overdue:1:2026-11-17']);
    expect(plan([manual], '2026-11-18', settingsWith({ overdue: false })).filter((e) => e.type === 'overdue')).toEqual([]);
  });

  it('alerts a trial ending within N days', () => {
    const s = sub({ trialEndsAt: '2026-11-21' });
    const keys = (today: string, days = 3) => plan([s], today, settingsWith({ trial: { enabled: true, days } })).filter((e) => e.type === 'trialEnding').map((e) => e.key);
    expect(keys('2026-11-17')).toEqual([]);
    expect(keys('2026-11-18')).toEqual(['trialEnding:1:2026-11-21']);
    expect(keys('2026-11-21')).toEqual(['trialEnding:1:2026-11-21']);
    expect(keys('2026-11-22')).toEqual([]);
    expect(plan([s], '2026-11-18', settingsWith({ trial: { enabled: false, days: 3 } })).filter((e) => e.type === 'trialEnding')).toEqual([]);
  });

  it('alerts when the month heads over budget', () => {
    const s = sub({ amountMinor: 5000, nextDue: '2026-11-25', anchorDay: 25 });
    const over = plan([s], '2026-11-18', settingsWith({ budget: { enabled: true, amountMinor: 4000 } }));
    expect(over.filter((e) => e.type === 'budgetExceeded')).toEqual([
      { type: 'budgetExceeded', key: 'budgetExceeded:2026-11', month: '2026-11', budgetMinor: 4000, spentMinor: 0, projectedMinor: 5000 },
    ]);
    expect(plan([s], '2026-11-18', settingsWith({ budget: { enabled: true, amountMinor: 6000 } })).filter((e) => e.type === 'budgetExceeded')).toEqual([]);
  });

  it('sends weekly digests on the chosen weekday and monthly ones on the day (last day in short months)', () => {
    const s = sub({ nextDue: '2026-11-20', anchorDay: 20 });
    const weekly = settingsWith({ digestWeekly: { enabled: true, weekday: 3 } }); // Wednesday
    expect(plan([s], '2026-11-18', weekly).find((e) => e.type === 'digest')).toMatchObject({ key: 'digest:weekly:2026-11-18', from: '2026-11-18', to: '2026-11-24' });
    expect(plan([s], '2026-11-19', weekly).find((e) => e.type === 'digest')).toBeUndefined();
    const monthly = settingsWith({ digestMonthly: { enabled: true, day: 31 } });
    expect(plan([s], '2027-02-28', monthly).find((e) => e.type === 'digest')).toMatchObject({ key: 'digest:monthly:2027-02', from: '2027-02-28', to: '2027-03-27' });
    expect(plan([s], '2027-02-27', monthly).find((e) => e.type === 'digest')).toBeUndefined();
    expect(plan([s], '2026-12-31', monthly).find((e) => e.type === 'digest')).toMatchObject({ to: '2027-01-30' });
  });
});

describe('planToday and delivery', () => {
  it('waits for the reminder time in the user time zone, then sends once per channel', async () => {
    const s = setup({ now: '2026-11-28T05:00:00Z' }); // 08:00 Istanbul
    s.add({ name: 'Netflix', nextDue: '2026-12-01' });
    s.channel();
    await runNotifications(s.ctx);
    expect(s.fetchMock).not.toHaveBeenCalled();
    s.clock.set('2026-11-28T06:00:00Z'); // 09:00
    await runNotifications(s.ctx);
    expect(s.fetchMock).toHaveBeenCalledTimes(1);
    expect(s.sentTexts()[0]).toContain('*Netflix is due in 3 days*');
    await runNotifications(s.ctx);
    s.clock.set('2026-11-28T20:00:00Z');
    await runNotifications(s.ctx);
    expect(s.fetchMock).toHaveBeenCalledTimes(1);
    expect(s.log()).toMatchObject([{ status: 'sent', type: 'reminder', dedupKey: 'reminder:1:2026-12-01:3:ch1' }]);
  });

  it('uses the local date: late evening in New York is still the day before', async () => {
    const s = setup({ now: '2026-11-29T03:30:00Z', tz: 'America/New_York' }); // Nov 28 22:30 local
    s.add({ name: 'Netflix', nextDue: '2026-12-01' });
    s.channel();
    expect(planToday(s.ctx)).toBe(1);
    expect(s.log()[0]!.dedupKey).toBe('reminder:1:2026-12-01:3:ch1');
  });

  it('survives a restart: the log table keeps it from going out twice', async () => {
    const s = setup({ now: '2026-11-28T09:00:00Z' });
    s.add({ name: 'Netflix', nextDue: '2026-12-01' });
    s.channel();
    await runNotifications(s.ctx);
    const restarted: ServiceCtx = { ...s.ctx }; // same database, fresh process state
    await runNotifications(restarted);
    expect(s.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends to every enabled channel and skips disabled ones', async () => {
    const s = setup({ now: '2026-11-28T09:00:00Z' });
    s.add({ name: 'Netflix', nextDue: '2026-12-01' });
    s.channel();
    s.channel({ name: 'Off', enabled: false });
    s.channel({ type: 'discord', name: 'Discord', secrets: { webhookUrl: 'https://discord.test/h' } });
    await runNotifications(s.ctx);
    expect(s.fetchMock.mock.calls.map((c) => c[0])).toEqual(['https://slack.test/hook', 'https://discord.test/h']);
  });

  it('retries transient failures with backoff, then gives up; permanent errors are not retried', async () => {
    const s = setup({ now: '2026-11-28T09:00:00Z', status: 503 });
    s.add({ name: 'Netflix', nextDue: '2026-12-01' });
    s.channel();
    await runNotifications(s.ctx);
    expect(s.log()[0]).toMatchObject({ status: 'failed', attempts: 1, error: 'HTTP 503: nope', nextAttemptAt: '2026-11-28T09:01:00.000Z' });
    await deliverQueued(s.ctx); // too early
    expect(s.fetchMock).toHaveBeenCalledTimes(1);
    let t = new Date('2026-11-28T09:00:00Z').getTime();
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      t += BACKOFF_MINUTES[attempt - 1]! * 60_000;
      s.clock.set(new Date(t));
      await deliverQueued(s.ctx);
    }
    expect(s.fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(s.log()[0]).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS, nextAttemptAt: null });

    const p = setup({ now: '2026-11-28T09:00:00Z', status: 404 });
    p.add({ name: 'Netflix', nextDue: '2026-12-01' });
    p.channel();
    await runNotifications(p.ctx);
    expect(p.log()[0]).toMatchObject({ status: 'failed', attempts: 1, nextAttemptAt: null });
  });

  it('recovers after a failure', async () => {
    const s = setup({ now: '2026-11-28T09:00:00Z', status: 500 });
    s.add({ name: 'Netflix', nextDue: '2026-12-01' });
    s.channel();
    await runNotifications(s.ctx);
    s.setStatus(200);
    s.clock.set('2026-11-28T09:01:00Z');
    await runNotifications(s.ctx);
    expect(s.log()[0]).toMatchObject({ status: 'sent', attempts: 2, error: null });
  });

  it('renders the user language and an edited template', async () => {
    const s = setup({ now: '2026-11-28T09:00:00Z', locale: 'tr' });
    s.add({ name: 'Netflix', nextDue: '2026-12-01', amountMinor: 22999 });
    s.channel();
    await runNotifications(s.ctx);
    expect(s.sentTexts()[0]).toContain('Netflix ödemesi 3 gün sonra');
    expect(s.sentTexts()[0]).toContain('₺229,99');

    const e = setup({ now: '2026-11-28T09:00:00Z' });
    e.add({ name: 'Netflix', nextDue: '2026-12-01' });
    e.channel();
    saveTemplate(e.ctx, e.user.id, 'reminder', { title: 'Pay {{name}}', body: '{{amount}} on {{dueDate}}' });
    await runNotifications(e.ctx);
    expect(e.sentTexts()[0]).toMatch(/^\*Pay Netflix\*\n(TRY|₺)\s?99\.99 on December 1, 2026$/);
  });

  it('sends the due-day message for auto-pay subscriptions after they are charged', async () => {
    const s = setup({ now: '2026-12-01T09:00:00Z' });
    s.add({ name: 'Netflix', nextDue: '2026-12-01', autoPay: true, reminderOffsets: [0] });
    s.channel();
    const { runAutoPay } = await import('../src/server/services/autopay.js');
    runAutoPay(s.ctx);
    await runNotifications(s.ctx);
    expect(s.sentTexts()[0]).toContain('charged automatically today');
  });
});

describe('price change alerts', () => {
  it('queues an alert when the amount is edited, and when a manual payment differs', async () => {
    const s = setup();
    s.channel();
    const row = s.add({ name: 'Netflix', amountMinor: 10000 });
    updateSubscription(s.ctx, s.user.id, row.id, { amountMinor: 12000 });
    updateSubscription(s.ctx, s.user.id, row.id, { name: 'Netflix HD' }); // no amount change, no alert
    markPaid(s.ctx, s.user.id, row.id, { amountMinor: 12500, now: s.clock.now });
    await deliverQueued(s.ctx);
    const texts = s.sentTexts();
    expect(texts).toHaveLength(2);
    expect(texts[0]).toMatch(/100\.00 to (TRY|₺)\s?120\.00 \(\+20%\)/);
    expect(texts[1]).toMatch(/120\.00 to (TRY|₺)\s?125\.00/);
    expect(texts[1]).toContain('paid for December 1, 2026');
  });

  it('ignores variable bills, equal amounts and a switched-off setting', async () => {
    const s = setup();
    s.channel();
    const variable = s.add({ name: 'Power', amountMinor: 10000, variableAmount: true });
    markPaid(s.ctx, s.user.id, variable.id, { amountMinor: 13000, now: s.clock.now });
    const same = s.add({ name: 'Same', amountMinor: 10000 });
    markPaid(s.ctx, s.user.id, same.id, { now: s.clock.now });
    saveNotifySettings(s.ctx, s.user.id, { ...DEFAULT_NOTIFY_SETTINGS, priceChange: false });
    const off = s.add({ name: 'Off', amountMinor: 10000 });
    notifyPriceChange(s.ctx, off, 10000, 20000, null);
    expect(s.log()).toEqual([]);
  });
});

describe('planning per user', () => {
  it('plans each user at their own local reminder time', async () => {
    const s = setup({ now: '2026-11-18T05:00:00Z', tz: 'Europe/Istanbul' });
    s.channel();
    s.add({ name: 'A-sub', nextDue: '2026-11-19', anchorDay: 19 });
    const other = s.db.insert(users).values({ username: 'b', passwordHash: 'x', createdAt: NOW }).returning().get();
    s.db.insert(settings).values([
      { userId: other.id, key: 'timezone', value: 'America/New_York' },
      { userId: other.id, key: 'baseCurrency', value: 'TRY' },
    ]).run();
    s.channel({ userId: other.id, secrets: { webhookUrl: 'https://slack.test/other' } });
    s.add({ userId: other.id, name: 'B-sub', nextDue: '2026-11-19', anchorDay: 19 });
    const queuedFor = () => s.log().map((l) => l.userId);

    expect(planToday(s.ctx)).toBe(0); // 08:00 Istanbul, 00:00 New York
    s.clock.set('2026-11-18T06:00:00Z'); // 09:00 Istanbul
    planToday(s.ctx);
    expect(queuedFor()).toEqual([s.user.id]);
    s.clock.set('2026-11-18T14:00:00Z'); // 09:00 New York
    planToday(s.ctx);
    expect(queuedFor()).toEqual([s.user.id, other.id]);
  });
});
