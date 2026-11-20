// Rendering per channel, the sent-notifications log, and delivery with retries.
import { and, desc, eq, lt, lte, or } from 'drizzle-orm';
import { notificationChannels, notificationLog } from '../../db/schema.js';
import { renderTemplate, type TemplateVars } from '../../../shared/notify/template.js';
import type { ApiNotificationLog, ChannelType, NotifyType, TemplateText } from '../../../shared/notify/types.js';
import type { ServiceCtx } from '../context.js';
import { ADAPTERS, bodyFormat, DeliveryError, type OutMessage } from './adapters.js';
import type { ChannelRow } from './channels.js';

/** Minutes to wait before attempt 2, 3, …; after the last one a failure stays failed. */
export const BACKOFF_MINUTES = [1, 5, 30, 120, 720];
export const MAX_ATTEMPTS = BACKOFF_MINUTES.length + 1;
/** A row left "sending" this long (the process stopped mid-send) is tried again. */
const STUCK_MS = 10 * 60_000;

export function renderMessage(channelType: ChannelType, type: NotifyType, tpl: TemplateText, vars: TemplateVars): OutMessage {
  const title = renderTemplate(tpl.title, vars, 'text').trim() || 'Coinio';
  const url = typeof vars.link === 'string' && vars.link ? vars.link : typeof vars.appUrl === 'string' ? vars.appUrl : '';
  return {
    type,
    title,
    body: renderTemplate(tpl.body, vars, bodyFormat(channelType)).trim(),
    text: renderTemplate(tpl.body, vars, 'text').trim(),
    url,
    vars,
  };
}

/** Sends right away (tests and "Send test"); null on success, otherwise the error text. */
export async function sendDirect(ctx: ServiceCtx, channel: ChannelRow, msg: OutMessage): Promise<string | null> {
  try {
    await ADAPTERS[channel.type as ChannelType](ctx, channel.config, channel.secrets, msg);
    return null;
  } catch (err) {
    return err instanceof DeliveryError ? err.message : String((err as Error)?.message ?? err);
  }
}

/** Adds a message to the queue unless the same key was queued before; true when it was added. */
export function enqueue(
  ctx: ServiceCtx,
  e: { key: string; type: NotifyType; channel: ChannelRow; subscriptionId?: number | null; msg: OutMessage },
): boolean {
  const res = ctx.db
    .insert(notificationLog)
    .values({
      dedupKey: `${e.key}:ch${e.channel.id}`,
      type: e.type,
      channelId: e.channel.id,
      subscriptionId: e.subscriptionId ?? null,
      title: e.msg.title,
      payload: e.msg as unknown as Record<string, unknown>,
      status: 'queued',
      createdAt: ctx.now().toISOString(),
    })
    .onConflictDoNothing()
    .run();
  return res.changes > 0;
}

/** Records a send that already happened (a test), so it shows in the recent list. */
export function recordDirect(ctx: ServiceCtx, channel: ChannelRow, msg: OutMessage, error: string | null): void {
  const stamp = ctx.now().toISOString();
  ctx.db.insert(notificationLog).values({
    dedupKey: `test:${channel.id}:${stamp}:${Math.random().toString(36).slice(2)}`,
    type: msg.type,
    channelId: channel.id || null,
    title: msg.title,
    payload: {},
    status: error ? 'failed' : 'sent',
    attempts: 1,
    error,
    createdAt: stamp,
    sentAt: error ? null : stamp,
  }).run();
}

/** Sends queued messages and failed ones whose retry time has come. Returns how many were sent. */
export async function deliverQueued(ctx: ServiceCtx): Promise<number> {
  const now = ctx.now();
  const stamp = now.toISOString();
  const rows = ctx.db
    .select({ log: notificationLog, channel: notificationChannels })
    .from(notificationLog)
    .innerJoin(notificationChannels, eq(notificationLog.channelId, notificationChannels.id))
    .where(
      or(
        eq(notificationLog.status, 'queued'),
        and(eq(notificationLog.status, 'failed'), lte(notificationLog.nextAttemptAt, stamp)),
        and(eq(notificationLog.status, 'sending'), lt(notificationLog.nextAttemptAt, new Date(now.getTime() - STUCK_MS).toISOString())),
      ),
    )
    .orderBy(notificationLog.id)
    .limit(50)
    .all();

  let sent = 0;
  for (const { log, channel } of rows) {
    if (!channel.enabled) {
      ctx.db.update(notificationLog).set({ status: 'failed', error: 'Channel is switched off', nextAttemptAt: null }).where(eq(notificationLog.id, log.id)).run();
      continue;
    }
    const attempts = log.attempts + 1;
    ctx.db.update(notificationLog).set({ status: 'sending', attempts, nextAttemptAt: stamp }).where(eq(notificationLog.id, log.id)).run();
    let error: string | null = null;
    let transient = false;
    try {
      await ADAPTERS[channel.type as ChannelType](ctx, channel.config, channel.secrets, log.payload as unknown as OutMessage);
    } catch (err) {
      error = err instanceof DeliveryError ? err.message : String((err as Error)?.message ?? err);
      transient = err instanceof DeliveryError ? err.transient : false;
    }
    if (error === null) {
      sent++;
      ctx.db.update(notificationLog).set({ status: 'sent', error: null, sentAt: ctx.now().toISOString(), nextAttemptAt: null }).where(eq(notificationLog.id, log.id)).run();
    } else {
      const retry = transient && attempts < MAX_ATTEMPTS;
      const next = retry ? new Date(now.getTime() + BACKOFF_MINUTES[attempts - 1]! * 60_000).toISOString() : null;
      ctx.db.update(notificationLog).set({ status: 'failed', error, nextAttemptAt: next }).where(eq(notificationLog.id, log.id)).run();
    }
  }
  return sent;
}

export function listLog(ctx: ServiceCtx, limit = 20): ApiNotificationLog[] {
  return ctx.db
    .select({ log: notificationLog, channelName: notificationChannels.name })
    .from(notificationLog)
    .leftJoin(notificationChannels, eq(notificationLog.channelId, notificationChannels.id))
    .orderBy(desc(notificationLog.id))
    .limit(limit)
    .all()
    .map(({ log, channelName }) => ({
      id: log.id,
      type: log.type as NotifyType,
      channelId: log.channelId,
      channelName,
      title: log.title,
      status: log.status,
      attempts: log.attempts,
      error: log.error,
      createdAt: log.createdAt,
      sentAt: log.sentAt,
    }));
}
