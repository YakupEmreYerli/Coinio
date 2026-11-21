// One adapter per channel type, all behind the same `send`. Each throws a DeliveryError whose message is
// what the service itself said, so "Send test" can show the exact reason.
import nodemailer from 'nodemailer';
import { renderTemplate, type Format, type TemplateVars } from '../../../shared/notify/template.js';
import { CHANNEL_FORMATS, parseHeaderLines, type ChannelType, type ChannelValues, type NotifyType } from '../../../shared/notify/types.js';
import type { ServiceCtx } from '../context.js';
import { BlockedAddressError, assertPublicSmtpHost, guardedFetch } from '../netGuard.js';

export class DeliveryError extends Error {
  constructor(message: string, readonly transient: boolean) {
    super(message);
  }
}

/** A message rendered for one channel: the title as plain text, the body in the channel's format and as text. */
export type OutMessage = {
  type: NotifyType;
  title: string;
  body: string;
  text: string;
  /** A link to open (the subscription, or the app), when there is one. */
  url: string;
  vars: TemplateVars;
};

type Secrets = Record<string, string>;
type Send = (ctx: ServiceCtx, config: ChannelValues, secrets: Secrets, msg: OutMessage) => Promise<void>;

/** The body format each channel is rendered in (plus plain text, always). */
export const bodyFormat = (type: ChannelType): Format => CHANNEL_FORMATS[type];

const TIMEOUT_MS = 15_000;
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
const join = (base: string, path: string) => `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;

/** The most useful text in an error response: a JSON description/message/error, else the raw body. */
function detailOf(text: string): string {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const pick = j.description ?? j.message ?? j.error ?? (Array.isArray(j.errors) ? j.errors.join(', ') : undefined);
    if (pick !== undefined) return clip(typeof pick === 'string' ? pick : JSON.stringify(pick), 300);
  } catch {
    // not JSON
  }
  return clip(text.trim(), 300);
}

async function http(ctx: ServiceCtx, url: string, init: RequestInit & { headers?: Record<string, string> }): Promise<void> {
  let res: Response;
  try {
    res = await guardedFetch(ctx, url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    if (err instanceof BlockedAddressError) throw new DeliveryError(err.message, false);
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    const reason = (err as Error).name === 'TimeoutError' ? 'timed out' : (cause?.code ?? cause?.message ?? (err as Error).message);
    throw new DeliveryError(`Could not reach ${new URL(url).host}: ${reason}`, true);
  }
  if (res.ok) return;
  const detail = detailOf(await res.text().catch(() => ''));
  const transient = res.status >= 500 || res.status === 429 || res.status === 408;
  throw new DeliveryError(`HTTP ${res.status}${detail ? `: ${detail}` : ''}`, transient);
}

const postJson = (ctx: ServiceCtx, url: string, body: unknown, headers: Record<string, string> = {}) =>
  http(ctx, url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

const telegram: Send = async (ctx, c, s, m) => {
  // Telegram allows 4096 characters; cutting HTML could break a tag, so a long message goes as plain text.
  const full = `<b>${escapeHtml(m.title)}</b>\n\n${m.body}`;
  const fits = full.length <= 4096;
  await postJson(ctx, `https://api.telegram.org/bot${s.botToken}/sendMessage`, {
    chat_id: str(c.chatId),
    ...(c.threadId ? { message_thread_id: Number(c.threadId) } : {}),
    text: fits ? full : clip(`${m.title}\n\n${m.text}`, 4096),
    ...(fits ? { parse_mode: 'HTML' } : {}),
    disable_web_page_preview: true,
  }).catch((err: unknown) => {
    // Never leak the token through an error that quotes the URL.
    if (err instanceof DeliveryError) throw new DeliveryError(err.message.replaceAll(s.botToken ?? '\0', '***'), err.transient);
    throw err;
  });
};

const discord: Send = (ctx, _c, s, m) =>
  postJson(ctx, s.webhookUrl!, { username: 'Coinio', content: clip(`**${m.title}**\n${m.body}`, 2000), allowed_mentions: { parse: [] } });

const slack: Send = (ctx, _c, s, m) => postJson(ctx, s.webhookUrl!, { text: `*${m.title}*\n${m.body}` });

const ntfy: Send = (ctx, c, s, m) =>
  postJson(
    ctx,
    str(c.serverUrl).replace(/\/+$/, ''),
    { topic: str(c.topic), title: m.title, message: clip(m.body, 4000), markdown: true, ...(m.url ? { click: m.url } : {}) },
    s.token ? { authorization: `Bearer ${s.token}` } : {},
  );

const gotify: Send = (ctx, c, s, m) =>
  postJson(
    ctx,
    join(str(c.url), 'message'),
    {
      title: m.title,
      message: m.body,
      priority: 5,
      extras: { 'client::display': { contentType: 'text/markdown' }, ...(m.url ? { 'client::notification': { click: { url: m.url } } } : {}) },
    },
    { 'x-gotify-key': s.appToken! },
  );

const pushover: Send = (ctx, _c, s, m) => {
  const fits = m.body.length <= 1024;
  return postJson(ctx, 'https://api.pushover.net/1/messages.json', {
    token: s.appToken,
    user: s.userKey,
    title: clip(m.title, 250),
    message: fits ? m.body : clip(m.text, 1024),
    ...(fits ? { html: 1 } : {}),
    ...(m.url ? { url: m.url } : {}),
  });
};

const webhook: Send = async (ctx, c, s, m) => {
  const method = str(c.method) || 'POST';
  const headers: Record<string, string> = Object.fromEntries(parseHeaderLines(s.headers ?? '') ?? []);
  let body: string | undefined;
  if (method !== 'GET') {
    const template = str(c.bodyTemplate).trim();
    body = template
      ? renderTemplate(template, { ...m.vars, type: m.type, title: m.title, body: m.text, url: m.url }, 'json')
      : JSON.stringify({ event: m.type, title: m.title, body: m.text, url: m.url || null, data: m.vars });
    const hasType = Object.keys(headers).some((h) => h.toLowerCase() === 'content-type');
    if (!hasType) headers['content-type'] = 'application/json';
  }
  await http(ctx, str(c.url), { method, headers, body });
};

const apprise: Send = (ctx, c, s, m) =>
  postJson(ctx, join(str(c.serverUrl), 'notify/'), {
    urls: (s.urls ?? '').split(/[\s,]+/).filter(Boolean).join(','),
    title: m.title,
    body: m.body,
    format: 'markdown',
    type: m.type === 'overdue' || m.type === 'budgetExceeded' ? 'warning' : 'info',
  });

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const email: Send = async (ctx, c, s, m) => {
  const security = str(c.security);
  const name = str(c.host);
  let host: string;
  try {
    host = await assertPublicSmtpHost(ctx, name);
  } catch (err) {
    if (err instanceof BlockedAddressError) throw new DeliveryError(err.message, false);
    throw err;
  }
  const transport = nodemailer.createTransport({
    host,
    ...(host !== name ? { tls: { servername: name } } : {}),
    port: Number(c.port),
    secure: security === 'tls',
    requireTLS: security === 'starttls',
    ignoreTLS: security === 'none',
    auth: c.user ? { user: str(c.user), pass: s.password ?? '' } : undefined,
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });
  try {
    await transport.sendMail({
      from: str(c.from),
      to: str(c.to),
      subject: m.title,
      text: m.text,
      html:
        '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;font-size:15px;line-height:1.55;color:#1b1b1f">' +
        `<p style="font-size:17px;font-weight:600;margin:0 0 12px">${escapeHtml(m.title)}</p>${m.body}</div>`,
    });
  } catch (err) {
    const e = err as { message?: string; responseCode?: number; code?: string };
    // SMTP 4xx replies and connection problems are worth a retry; 5xx (bad login, rejected address) are not.
    const transient = e.responseCode ? e.responseCode < 500 : e.code !== 'EAUTH' && e.code !== 'EENVELOPE';
    throw new DeliveryError(e.message ?? String(err), transient);
  } finally {
    transport.close();
  }
};

export const ADAPTERS: Record<ChannelType, Send> = { email, telegram, discord, slack, ntfy, gotify, pushover, webhook, apprise };
