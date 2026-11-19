import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { settings, subscriptions, users } from '../src/server/db/schema.js';
import type { ServiceCtx } from '../src/server/services/context.js';
import { getInternalValue } from '../src/server/services/settings.js';
import { getSummary } from '../src/server/services/subscriptions.js';
import { buildReminderMessage, sendDueReminders } from '../src/server/services/telegram.js';
import { makeTestApp } from './helpers.js';

const NOW = '2026-11-18T09:00:00Z'; // 12:00 in Istanbul

function setup(opts: { configured?: boolean; ok?: boolean; now?: string } = {}) {
  const { configured = true, ok = true, now = NOW } = opts;
  const t = makeTestApp({ now: new Date(now) });
  const fetchMock = vi.fn(async () => new Response('{}', { status: ok ? 200 : 400 }));
  const ctx: ServiceCtx = { db: t.db, config: t.config, fetch: fetchMock as unknown as typeof fetch, now: () => t.clock.now };
  const user = t.db.insert(users).values({ username: 'y', passwordHash: 'x', createdAt: now }).returning().get();
  t.db.insert(settings).values([
    { key: 'locale', value: 'tr' },
    { key: 'timezone', value: 'Europe/Istanbul' },
  ]).run();
  if (configured) {
    t.db.insert(settings).values([
      { key: 'telegramBotToken', value: 'TOKEN123' },
      { key: 'telegramChatId', value: '42' },
    ]).run();
  }
  const add = (over: Partial<typeof subscriptions.$inferInsert>) =>
    t.db.insert(subscriptions).values({
      userId: user.id, name: 'X', amountMinor: 99999, currency: 'TRY', cycle: 'monthly', intervalCount: 1,
      anchorDay: 1, nextDue: '2026-12-01', autoPay: false, reminderDays: 7, createdAt: now, updatedAt: now, ...over,
    }).returning().get();
  return { ...t, ctx, user, add, fetchMock };
}

function seed(s: ReturnType<typeof setup>) {
  s.add({ name: 'Claude Max', nextDue: '2026-11-09', anchorDay: 9 });
  s.add({ name: 'ChatGPT Plus', nextDue: '2026-11-22', anchorDay: 22 });
}

describe('buildReminderMessage', () => {
  it('lists overdue and upcoming items in Turkish', () => {
    const s = setup();
    seed(s);
    const summary = getSummary(s.ctx, s.user.id, s.clock.now);
    const msg = buildReminderMessage({ summary, todayAutoPaid: [], today: '2026-11-18', locale: 'tr' })!;
    expect(msg).toContain('Claude Max');
    expect(msg).toContain('Geciken');
    expect(msg).toContain('ChatGPT Plus · 22 Kas');
    expect(msg).toContain('₺999,99');
  });

  it('formats English dates and tomorrow/today auto wording', () => {
    const s = setup();
    s.add({ name: 'Netflix', nextDue: '2026-11-19', autoPay: true, anchorDay: 19 });
    const summary = getSummary(s.ctx, s.user.id, s.clock.now);
    const en = buildReminderMessage({
      summary, todayAutoPaid: [{ name: 'Spotify', amountMinor: 5000, currency: 'USD' }], today: '2026-11-18', locale: 'en',
    })!;
    expect(en).toContain('Netflix · Nov 19');
    expect(en).toContain('will be charged tomorrow');
    expect(en).toContain('Spotify · $50.00');
    const tr = buildReminderMessage({ summary, todayAutoPaid: [], today: '2026-11-18', locale: 'tr' })!;
    expect(tr).toContain('yarın çekilecek');
  });

  it('returns null when nothing is due soon', () => {
    const s = setup();
    s.add({ name: 'Far', nextDue: '2026-12-30', anchorDay: 30 });
    const summary = getSummary(s.ctx, s.user.id, s.clock.now);
    expect(buildReminderMessage({ summary, todayAutoPaid: [], today: '2026-11-18', locale: 'tr' })).toBeNull();
  });

  it('escapes HTML in names', () => {
    const s = setup();
    s.add({ name: 'A<b>&Co', nextDue: '2026-11-19', anchorDay: 19 });
    const summary = getSummary(s.ctx, s.user.id, s.clock.now);
    const msg = buildReminderMessage({ summary, todayAutoPaid: [], today: '2026-11-18', locale: 'en' })!;
    expect(msg).toContain('A&lt;b&gt;&amp;Co');
    expect(msg).not.toContain('A<b>');
  });
});

describe('sendDueReminders', () => {
  it('sends once per local day and posts the expected Telegram payload', async () => {
    const s = setup();
    seed(s);
    expect(await sendDueReminders(s.ctx)).toBe('sent');
    expect(getInternalValue(s.ctx, 'lastReminderDate')).toBe('2026-11-18');
    const [url, init] = s.fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.telegram.org/botTOKEN123/sendMessage');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ chat_id: '42', parse_mode: 'HTML', disable_web_page_preview: true });
    expect(await sendDueReminders(s.ctx)).toBe('skipped');
    expect(s.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns not_configured without token', async () => {
    const s = setup({ configured: false });
    seed(s);
    expect(await sendDueReminders(s.ctx)).toBe('not_configured');
    expect(s.fetchMock).not.toHaveBeenCalled();
  });

  it('waits until the reminder time', async () => {
    const s = setup({ now: '2026-11-18T05:00:00Z' }); // 08:00 Istanbul, before 09:00
    seed(s);
    expect(await sendDueReminders(s.ctx)).toBe('skipped');
    expect(s.fetchMock).not.toHaveBeenCalled();
    s.clock.set('2026-11-18T06:00:00Z');
    expect(await sendDueReminders(s.ctx)).toBe('sent');
  });

  it('does not throw on a Telegram error and keeps lastReminderDate unset', async () => {
    const s = setup({ ok: false });
    seed(s);
    expect(await sendDueReminders(s.ctx)).toBe('skipped');
    expect(getInternalValue(s.ctx, 'lastReminderDate')).toBeNull();
  });

  it('marks the day done without sending when there is nothing to say', async () => {
    const s = setup();
    expect(await sendDueReminders(s.ctx)).toBe('skipped');
    expect(getInternalValue(s.ctx, 'lastReminderDate')).toBe('2026-11-18');
    expect(s.fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/settings/telegram/test', () => {
  async function login(app: ReturnType<typeof makeTestApp>['app']) {
    const agent = request.agent(app);
    await agent.post('/api/auth/setup').send({ username: 'y', password: 'password-123456' });
    return agent;
  }

  it('requires a session', async () => {
    const { app } = makeTestApp();
    await request(app).post('/api/settings/telegram/test').expect(401);
  });

  it('returns 400 when not configured', async () => {
    const { app } = makeTestApp();
    const agent = await login(app);
    await agent.post('/api/settings/telegram/test').expect(400, { error: 'not_configured' });
  });

  it('returns 200 on success and 502 on a Telegram failure', async () => {
    for (const [status, expected] of [[200, 200], [401, 502]] as const) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status })));
      const { app } = makeTestApp({ config: { telegramBotToken: 'T', telegramChatId: '1' } });
      const agent = await login(app);
      const res = await agent.post('/api/settings/telegram/test');
      expect(res.status).toBe(expected);
      if (expected === 502) expect(res.body).toEqual({ error: 'telegram_error' });
      vi.unstubAllGlobals();
    }
  });
});
