import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServiceCtx } from '../src/server/services/context.js';

const sendMail = vi.fn();
const close = vi.fn();
const createTransport = vi.fn((_opts: unknown) => ({ sendMail, close }));
vi.mock('nodemailer', () => ({ default: { createTransport: (o: unknown) => createTransport(o) } }));

const { ADAPTERS, DeliveryError } = await import('../src/server/services/notify/adapters.js');

type Call = [string, RequestInit & { headers: Record<string, string> }];

function ctxWith(response: () => Response | Promise<Response> = () => new Response('{}', { status: 200 })) {
  const fetch = vi.fn(async (_url: string, _init: RequestInit) => response());
  const ctx = { fetch: fetch as unknown as typeof globalThis.fetch } as ServiceCtx;
  const call = (i = 0) => fetch.mock.calls[i] as unknown as Call;
  const json = (i = 0) => JSON.parse(call(i)[1].body as string) as Record<string, unknown>;
  return { ctx, fetch, call, json };
}

const msg = {
  type: 'reminder' as const,
  title: 'Netflix is due tomorrow',
  body: '**Netflix** · $15.99',
  text: 'Netflix · $15.99',
  url: 'https://coinio.test/subscriptions/1',
  vars: { name: 'Netflix', amount: '$15.99' },
};

beforeEach(() => {
  sendMail.mockReset();
  createTransport.mockClear();
});

describe('channel adapters', () => {
  it('telegram posts HTML to the bot API', async () => {
    const t = ctxWith();
    await ADAPTERS.telegram(t.ctx, { chatId: '42' }, { botToken: 'TOK' }, { ...msg, body: '<b>Netflix</b>' });
    expect(t.call()[0]).toBe('https://api.telegram.org/botTOK/sendMessage');
    expect(t.json()).toEqual({ chat_id: '42', text: '<b>Netflix is due tomorrow</b>\n\n<b>Netflix</b>', parse_mode: 'HTML', disable_web_page_preview: true });
  });

  it('telegram posts into a forum topic when a topic ID is set', async () => {
    const t = ctxWith();
    await ADAPTERS.telegram(t.ctx, { chatId: '-100123', threadId: 42 }, { botToken: 'TOK' }, msg);
    expect(t.json()).toMatchObject({ chat_id: '-100123', message_thread_id: 42 });
  });

  it('telegram shows the API description and never the token', async () => {
    const t = ctxWith(() => new Response(JSON.stringify({ ok: false, description: 'Bad Request: chat not found' }), { status: 400 }));
    const err = await ADAPTERS.telegram(t.ctx, { chatId: '1' }, { botToken: 'TOK' }, msg).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DeliveryError);
    expect((err as InstanceType<typeof DeliveryError>).message).toBe('HTTP 400: Bad Request: chat not found');
    expect((err as InstanceType<typeof DeliveryError>).transient).toBe(false);
  });

  it('discord and slack post to the webhook', async () => {
    const d = ctxWith();
    await ADAPTERS.discord(d.ctx, {}, { webhookUrl: 'https://discord.test/hook' }, msg);
    expect(d.call()[0]).toBe('https://discord.test/hook');
    expect(d.json()).toMatchObject({ username: 'Coinio', content: '**Netflix is due tomorrow**\n**Netflix** · $15.99', allowed_mentions: { parse: [] } });
    const s = ctxWith();
    await ADAPTERS.slack(s.ctx, {}, { webhookUrl: 'https://slack.test/hook' }, { ...msg, body: '*Netflix*' });
    expect(s.json()).toEqual({ text: '*Netflix is due tomorrow*\n*Netflix*' });
  });

  it('ntfy publishes JSON with markdown, click link and an optional token', async () => {
    const t = ctxWith();
    await ADAPTERS.ntfy(t.ctx, { serverUrl: 'https://ntfy.test/', topic: 'bills' }, { token: 'tk_1' }, msg);
    expect(t.call()[0]).toBe('https://ntfy.test');
    expect(t.call()[1].headers).toMatchObject({ authorization: 'Bearer tk_1' });
    expect(t.json()).toEqual({ topic: 'bills', title: msg.title, message: msg.body, markdown: true, click: msg.url });
    const anon = ctxWith();
    await ADAPTERS.ntfy(anon.ctx, { serverUrl: 'https://ntfy.sh', topic: 't' }, {}, { ...msg, url: '' });
    expect(anon.call()[1].headers).not.toHaveProperty('authorization');
    expect(anon.json()).not.toHaveProperty('click');
  });

  it('gotify sends markdown with the app token header', async () => {
    const t = ctxWith();
    await ADAPTERS.gotify(t.ctx, { url: 'https://gotify.test' }, { appToken: 'A1' }, msg);
    expect(t.call()[0]).toBe('https://gotify.test/message');
    expect(t.call()[1].headers).toMatchObject({ 'x-gotify-key': 'A1' });
    expect(t.json()).toMatchObject({ title: msg.title, message: msg.body, priority: 5, extras: { 'client::display': { contentType: 'text/markdown' } } });
  });

  it('pushover sends HTML with user key and token', async () => {
    const t = ctxWith();
    await ADAPTERS.pushover(t.ctx, {}, { userKey: 'U', appToken: 'T' }, msg);
    expect(t.call()[0]).toBe('https://api.pushover.net/1/messages.json');
    expect(t.json()).toEqual({ token: 'T', user: 'U', title: msg.title, message: msg.body, html: 1, url: msg.url });
  });

  it('webhook sends the default JSON, or the body template with JSON-escaped values, and custom headers', async () => {
    const t = ctxWith();
    await ADAPTERS.webhook(t.ctx, { url: 'https://hook.test/x', method: 'POST' }, { headers: 'Authorization: Bearer abc\nX-Env: prod' }, msg);
    expect(t.call()[1]).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer abc', 'X-Env': 'prod', 'content-type': 'application/json' } });
    expect(t.json()).toEqual({ event: 'reminder', title: msg.title, body: msg.text, url: msg.url, data: msg.vars });

    const custom = ctxWith();
    await ADAPTERS.webhook(custom.ctx, { url: 'https://hook.test/x', method: 'PUT', bodyTemplate: '{"msg":"{{title}}","who":"{{name}}"}' }, {}, {
      ...msg, title: 'Say "hi"',
    });
    expect(custom.call()[1].method).toBe('PUT');
    expect(custom.json()).toEqual({ msg: 'Say "hi"', who: 'Netflix' });

    const get = ctxWith();
    await ADAPTERS.webhook(get.ctx, { url: 'https://hook.test/x', method: 'GET' }, {}, msg);
    expect(get.call()[1].body).toBeUndefined();
  });

  it('apprise posts to the stateless notify endpoint', async () => {
    const t = ctxWith();
    await ADAPTERS.apprise(t.ctx, { serverUrl: 'http://apprise:8000' }, { urls: 'mailto://a:b@x.test\ntgram://t/c' }, msg);
    expect(t.call()[0]).toBe('http://apprise:8000/notify/');
    expect(t.json()).toEqual({ urls: 'mailto://a:b@x.test,tgram://t/c', title: msg.title, body: msg.body, format: 'markdown', type: 'info' });
  });

  it('classifies 5xx, 429 and network errors as transient', async () => {
    for (const status of [500, 503, 429]) {
      const t = ctxWith(() => new Response('oops', { status }));
      const err = (await ADAPTERS.slack(t.ctx, {}, { webhookUrl: 'https://slack.test' }, msg).catch((e: unknown) => e)) as InstanceType<typeof DeliveryError>;
      expect(err.transient).toBe(true);
      expect(err.message).toBe(`HTTP ${status}: oops`);
    }
    const down = ctxWith(() => {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    });
    const err = (await ADAPTERS.discord(down.ctx, {}, { webhookUrl: 'https://discord.test/h' }, msg).catch((e: unknown) => e)) as InstanceType<typeof DeliveryError>;
    expect(err).toMatchObject({ transient: true, message: 'Could not reach discord.test: ECONNREFUSED' });
  });

  it('email sends text and HTML through nodemailer with the chosen security', async () => {
    sendMail.mockResolvedValue({ messageId: '1' });
    await ADAPTERS.email({} as ServiceCtx, { host: 'smtp.test', port: 465, security: 'tls', user: 'me', from: 'Coinio <c@x.test>', to: 'me@x.test' }, { password: 'pw' }, {
      ...msg, body: '<b>Netflix</b>',
    });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.test', port: 465, secure: true, requireTLS: false, auth: { user: 'me', pass: 'pw' } }));
    const mail = sendMail.mock.calls[0]![0] as Record<string, string>;
    expect(mail).toMatchObject({ from: 'Coinio <c@x.test>', to: 'me@x.test', subject: msg.title, text: msg.text });
    expect(mail.html).toContain('<b>Netflix</b>');
    expect(close).toHaveBeenCalled();
  });

  it('email reports the SMTP error; a rejected login is not retried', async () => {
    sendMail.mockRejectedValue(Object.assign(new Error('Invalid login: 535 Authentication failed'), { code: 'EAUTH', responseCode: 535 }));
    const err = (await ADAPTERS.email({} as ServiceCtx, { host: 'h', port: 587, security: 'starttls', from: 'a@x', to: 'b@x' }, {}, msg).catch((e: unknown) => e)) as InstanceType<typeof DeliveryError>;
    expect(err).toMatchObject({ transient: false, message: 'Invalid login: 535 Authentication failed' });
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: false, requireTLS: true, auth: undefined }));
  });
});

describe('private network guard', () => {
  const guarded = (fetch = vi.fn(async () => new Response('{}'))) =>
    ({
      fetch: fetch as unknown as typeof globalThis.fetch,
      config: { blockPrivateNetworks: true },
      lookup: async (host: string) => [{ address: host === 'smtp.internal.example' ? '10.0.0.2' : '93.184.216.34', family: 4 }],
    }) as unknown as ServiceCtx;

  it('refuses a webhook on a private address, without retrying', async () => {
    const fetch = vi.fn(async () => new Response('{}'));
    const err = (await ADAPTERS.webhook(guarded(fetch), { url: 'http://169.254.169.254/latest', method: 'POST' }, {}, msg).catch((e: unknown) => e)) as InstanceType<typeof DeliveryError>;
    expect(err).toBeInstanceOf(DeliveryError);
    expect(err.message).toMatch(/^Blocked: .* private network/);
    expect(err.transient).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses an SMTP host on a private address', async () => {
    const err = (await ADAPTERS.email(guarded(), { host: 'smtp.internal.example', port: 587, security: 'starttls', from: 'a@x', to: 'b@x' }, {}, msg).catch((e: unknown) => e)) as InstanceType<typeof DeliveryError>;
    expect(err.message).toMatch(/^Blocked:/);
    expect(err.transient).toBe(false);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('connects to the checked SMTP address and keeps the name for TLS', async () => {
    await ADAPTERS.email(guarded(), { host: 'smtp.example.com', port: 465, security: 'tls', from: 'a@x', to: 'b@x' }, {}, msg);
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: '93.184.216.34', tls: { servername: 'smtp.example.com' } }));
  });
});
