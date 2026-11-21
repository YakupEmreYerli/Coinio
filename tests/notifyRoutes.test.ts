import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { notificationChannels } from '../src/server/db/schema.js';
import type { Config } from '../src/server/config.js';
import { addUser, makeTestApp } from './helpers.js';

async function login(opts: { status?: number; config?: Partial<Config> } = {}) {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
    new Response(opts.status && opts.status >= 400 ? JSON.stringify({ ok: false, description: 'Forbidden: bot was kicked' }) : '{"ok":true}', { status: opts.status ?? 200 }));
  const t = makeTestApp({ fetch: fetchMock as unknown as typeof fetch, config: opts.config });
  const agent = request.agent(t.app);
  await agent.post('/api/auth/setup').send({ username: 'y', password: 'password-123456' });
  return { ...t, agent, fetchMock };
}

const telegram = { type: 'telegram', name: 'My bot', config: { chatId: '-100123', threadId: '7' }, secrets: { botToken: '123456:SECRET-TOKEN' } };

describe('notification channels API', () => {
  it('requires a session', async () => {
    const { app } = makeTestApp();
    await request(app).get('/api/notifications').expect(401);
    await request(app).post('/api/notifications/channels').send(telegram).expect(401);
  });

  it('never returns a secret, only whether it is saved', async () => {
    const { agent } = await login();
    const created = await agent.post('/api/notifications/channels').send(telegram).expect(201);
    expect(created.body).toMatchObject({ type: 'telegram', name: 'My bot', enabled: true, config: { chatId: '-100123', threadId: 7 }, secrets: { botToken: true } });
    const page = await agent.get('/api/notifications').expect(200);
    expect(JSON.stringify(page.body)).not.toContain('SECRET-TOKEN');
    expect(JSON.stringify(created.body)).not.toContain('SECRET-TOKEN');
    expect(page.body.channels).toHaveLength(1);
  });

  it('keeps a saved secret when the field is left empty, replaces it when given', async () => {
    const { agent, db } = await login();
    const { body } = await agent.post('/api/notifications/channels').send(telegram);
    await agent.patch(`/api/notifications/channels/${body.id}`).send({ config: { chatId: '99' }, secrets: { botToken: '' } }).expect(200);
    expect(db.select().from(notificationChannels).get()).toMatchObject({ config: { chatId: '99' }, secrets: { botToken: '123456:SECRET-TOKEN' } });
    await agent.patch(`/api/notifications/channels/${body.id}`).send({ secrets: { botToken: 'NEW' } }).expect(200);
    expect(db.select().from(notificationChannels).get()!.secrets).toEqual({ botToken: 'NEW' });
  });

  it('validates fields per channel type', async () => {
    const { agent } = await login();
    const bad = [
      { ...telegram, secrets: {} },
      { ...telegram, config: { chatId: '1', threadId: '-3' } },
      { ...telegram, config: { chatId: '1', threadId: 'abc' } },
      { type: 'discord', name: 'D', secrets: { webhookUrl: 'ftp://x' } },
      { type: 'webhook', name: 'W', config: { url: 'https://x.test', bodyTemplate: '{{#a}}' } },
      { type: 'webhook', name: 'W', config: { url: 'https://x.test' }, secrets: { headers: 'no colon here' } },
      { type: 'carrier-pigeon', name: 'P' },
    ];
    for (const b of bad) expect((await agent.post('/api/notifications/channels').send(b)).status, JSON.stringify(b)).toBe(400);
    const ntfy = await agent.post('/api/notifications/channels').send({ type: 'ntfy', name: 'N', config: { topic: 'bills' } }).expect(201);
    expect(ntfy.body.config).toEqual({ serverUrl: 'https://ntfy.sh', topic: 'bills' });
  });

  it('sends a test with the topic ID, and shows the exact error on failure', async () => {
    const ok = await login();
    const { body } = await ok.agent.post('/api/notifications/channels').send(telegram);
    await ok.agent.post(`/api/notifications/channels/${body.id}/test`).expect(200);
    const sent = JSON.parse(ok.fetchMock.mock.calls[0]![1].body as string);
    expect(sent).toMatchObject({ chat_id: '-100123', message_thread_id: 7 });
    expect(sent.text).toContain('My bot');

    const failing = await login({ status: 403 });
    const ch = await failing.agent.post('/api/notifications/channels').send(telegram);
    const res = await failing.agent.post(`/api/notifications/channels/${ch.body.id}/test`).expect(502);
    expect(res.body).toEqual({ error: 'delivery_failed', message: 'HTTP 403: Forbidden: bot was kicked' });
    const log = await failing.agent.get('/api/notifications/log').expect(200);
    expect(log.body[0]).toMatchObject({ type: 'test', status: 'failed', error: 'HTTP 403: Forbidden: bot was kicked', channelName: 'My bot' });
  });

  it('tests an unsaved draft, filling in the saved secret when editing', async () => {
    const { agent, fetchMock } = await login();
    const { body } = await agent.post('/api/notifications/channels').send(telegram);
    await agent.post('/api/notifications/channels/test').send({ ...telegram, id: body.id, config: { chatId: '555' }, secrets: {} }).expect(200);
    expect(fetchMock.mock.calls[0]![0]).toContain('bot123456:SECRET-TOKEN');
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string).chat_id).toBe('555');
    await agent.post('/api/notifications/channels/test').send({ ...telegram, secrets: {} }).expect(400);
  });

  it('deletes a channel', async () => {
    const { agent } = await login();
    const { body } = await agent.post('/api/notifications/channels').send(telegram);
    await agent.delete(`/api/notifications/channels/${body.id}`).expect(204);
    await agent.delete(`/api/notifications/channels/${body.id}`).expect(404);
  });
});

describe('notification settings and templates API', () => {
  it('saves settings with sorted, unique offsets and rejects bad values', async () => {
    const { agent } = await login();
    const { body } = await agent.get('/api/notifications');
    expect(body.settings.offsets).toEqual({ weekly: [3, 1], monthly: [3, 1], yearly: [30, 7, 1] });
    const next = { ...body.settings, offsets: { ...body.settings.offsets, monthly: [1, 7, 7, 0] } };
    expect((await agent.put('/api/notifications/settings').send(next)).body.offsets.monthly).toEqual([7, 1, 0]);
    expect((await agent.put('/api/notifications/settings').send({ ...next, offsets: { ...next.offsets, yearly: [400] } })).status).toBe(400);
  });

  it('serves defaults in the saved language, saves and resets a template', async () => {
    const { agent } = await login();
    await agent.patch('/api/settings').send({ locale: 'tr' });
    let page = (await agent.get('/api/notifications')).body;
    expect(page.templates.reminder.custom).toBe(false);
    expect(page.templates.reminder.title).toContain('ödemesi');
    await agent.put('/api/notifications/templates/reminder').send({ title: 'Hey {{name}}', body: 'Due {{dueDate}}' }).expect(200);
    page = (await agent.get('/api/notifications')).body;
    expect(page.templates.reminder).toEqual({ title: 'Hey {{name}}', body: 'Due {{dueDate}}', custom: true });
    expect((await agent.put('/api/notifications/templates/reminder').send({ title: 'x', body: '{{#items}}' })).status).toBe(400);
    expect((await agent.put('/api/notifications/templates/nope').send({ title: 'x', body: 'y' })).status).toBe(400);
    await agent.delete('/api/notifications/templates/reminder').expect(204);
    expect((await agent.get('/api/notifications')).body.templates.reminder.custom).toBe(false);
  });

  it('sends a template test with sample data', async () => {
    const { agent, fetchMock } = await login();
    const { body } = await agent.post('/api/notifications/channels').send({ type: 'slack', name: 'S', secrets: { webhookUrl: 'https://slack.test/h' } });
    await agent.post('/api/notifications/templates/digest/test').send({ channelId: body.id, title: 'Week', body: '{{#items}}- {{name}}\n{{/items}}' }).expect(200);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string).text).toBe('*Week*\n- Netflix\n- Spotify');
  });
});

describe('Telegram from environment variables', () => {
  it('becomes a channel once, with the topic ID', async () => {
    const config = { telegramBotToken: 'ENVTOKEN', telegramChatId: '-1009', telegramThreadId: '12' };
    const { agent, db } = await login({ config });
    const rows = db.select().from(notificationChannels).all();
    expect(rows).toEqual([expect.objectContaining({ type: 'telegram', config: { chatId: '-1009', threadId: 12 }, secrets: { botToken: 'ENVTOKEN' } })]);
    await agent.delete(`/api/notifications/channels/${rows[0]!.id}`).expect(204);
    const { createApp } = await import('../src/server/app.js');
    createApp({ db, config: { ...makeTestApp().config, ...config } }); // a restart does not bring it back
    expect(db.select().from(notificationChannels).all()).toEqual([]);
  });
});

describe('subscriptions API reminder fields', () => {
  it('stores offsets and a trial end date, and maps the old reminderDays', async () => {
    const { agent } = await login();
    const base = { name: 'Netflix', amountMinor: 1000, currency: 'USD', cycle: 'monthly', intervalCount: 1, nextDue: '2026-12-01' };
    const a = await agent.post('/api/subscriptions').send({ ...base, reminderOffsets: [1, 7, 1], trialEndsAt: '2026-11-30' }).expect(201);
    expect(a.body).toMatchObject({ reminderOffsets: [7, 1], trialEndsAt: '2026-11-30' });
    const b = await agent.post('/api/subscriptions').send({ ...base, reminderDays: 5 }).expect(201);
    expect(b.body.reminderOffsets).toEqual([5]);
    expect(b.body).not.toHaveProperty('reminderDays');
    const c = await agent.patch(`/api/subscriptions/${a.body.id}`).send({ reminderOffsets: null, trialEndsAt: null }).expect(200);
    expect(c.body).toMatchObject({ reminderOffsets: null, trialEndsAt: null });
    expect((await agent.post('/api/subscriptions').send({ ...base, reminderOffsets: [61] })).status).toBe(400);
  });
});

describe('channels belong to their user', () => {
  it('hides another user’s channels, secrets and log', async () => {
    const t = await login();
    const created = await t.agent.post('/api/notifications/channels').send(telegram).expect(201);
    const id = created.body.id as number;
    await t.agent.post(`/api/notifications/channels/${id}/test`).expect(200);
    const b = addUser(t, 'b');
    await b.agent.patch(`/api/notifications/channels/${id}`).send({ name: 'x' }).expect(404);
    await b.agent.delete(`/api/notifications/channels/${id}`).expect(404);
    await b.agent.post(`/api/notifications/channels/${id}/test`).expect(404);
    await b.agent.post('/api/notifications/channels/test').send({ ...telegram, id }).expect(404);
    await b.agent.post('/api/notifications/templates/reminder/test').send({ channelId: id, title: 't', body: 'b' }).expect(404);
    const page = await b.agent.get('/api/notifications').expect(200);
    expect(page.body.channels).toEqual([]);
    expect(JSON.stringify(page.body)).not.toContain('SECRET-TOKEN');
    expect((await b.agent.get('/api/notifications/log').expect(200)).body).toEqual([]);
    expect((await t.agent.get('/api/notifications/log').expect(200)).body).toHaveLength(1);
  });

  it('waits for the first account before turning the Telegram variables into a channel', async () => {
    const config = { telegramBotToken: 'ENVTOKEN', telegramChatId: '-1009' };
    const t = makeTestApp({ config });
    expect(t.db.select().from(notificationChannels).all()).toEqual([]);
    const agent = request.agent(t.app);
    const me = await agent.post('/api/auth/setup').send({ username: 'y', password: 'password-123456' }).expect(201);
    expect(t.db.select().from(notificationChannels).all()).toEqual([expect.objectContaining({ type: 'telegram', userId: me.body.id })]);
  });
});
