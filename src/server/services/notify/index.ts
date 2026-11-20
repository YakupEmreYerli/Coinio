// The notification jobs: the daily plan, event alerts (price changes) and test sends.
import { and, asc, eq } from 'drizzle-orm';
import { payments, users } from '../../db/schema.js';
import type { SubscriptionRow } from '../../domain/summary.js';
import { todayIn } from '../../../shared/schedule.js';
import type { TemplateVars } from '../../../shared/notify/template.js';
import type { ChannelType, NotifyType, TemplateText } from '../../../shared/notify/types.js';
import { budgetVars, digestVars, priceChangeVars, sampleVars, subscriptionVars, testVars, trialVars } from '../../../shared/notify/vars.js';
import { toLocale } from '../../i18n/index.js';
import type { ServiceCtx } from '../context.js';
import { getSettings } from '../settings.js';
import { getSummary, listSubscriptions } from '../subscriptions.js';
import { listChannels, type ChannelRow } from './channels.js';
import { varFormat } from './format.js';
import { planNotifications, type PlannedEvent } from './plan.js';
import { deliverQueued, enqueue, recordDirect, renderMessage, sendDirect } from './queue.js';
import { effectiveTemplates, getNotifySettings } from './store.js';

function localTime(tz: string, now: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
}

function context(ctx: ServiceCtx) {
  const s = getSettings(ctx);
  const locale = toLocale(s.locale);
  return { s, locale, f: varFormat(locale), today: todayIn(s.timezone, ctx.now()), appUrl: ctx.config.publicUrl, templates: effectiveTemplates(ctx, locale) };
}

function eventVars(e: PlannedEvent, c: ReturnType<typeof context>): TemplateVars {
  const common = { today: c.today, base: c.s.baseCurrency, appUrl: c.appUrl };
  switch (e.type) {
    case 'reminder':
    case 'dueToday':
    case 'overdue':
      return subscriptionVars(e.sub, { ...common, dueDate: e.dueDate, baseMinor: e.baseMinor }, c.f);
    case 'trialEnding':
      return trialVars(e.sub, { ...common, trialEnd: e.trialEnd, baseMinor: e.baseMinor }, c.f);
    case 'digest':
      return digestVars({ ...common, from: e.from, to: e.to, items: e.items, overdue: e.overdue }, c.f);
    case 'budgetExceeded':
      return budgetVars({ ...common, month: e.month, budgetMinor: e.budgetMinor, spentMinor: e.spentMinor, projectedMinor: e.projectedMinor }, c.f);
  }
}

function fanOut(ctx: ServiceCtx, channels: ChannelRow[], e: { key: string; type: NotifyType; subscriptionId?: number }, tpl: TemplateText, vars: TemplateVars): number {
  let added = 0;
  for (const channel of channels) {
    const msg = renderMessage(channel.type as ChannelType, e.type, tpl, vars);
    if (enqueue(ctx, { key: e.key, type: e.type, channel, subscriptionId: e.subscriptionId, msg })) added++;
  }
  return added;
}

/** Queues today's notifications (after the reminder time) for every enabled channel. Returns how many were queued. */
export function planToday(ctx: ServiceCtx): number {
  const channels = listChannels(ctx).filter((c) => c.enabled);
  if (channels.length === 0) return 0;
  const c = context(ctx);
  if (localTime(c.s.timezone, ctx.now()) < c.s.reminderTime) return 0;
  const user = ctx.db.select().from(users).orderBy(asc(users.id)).get();
  if (!user) return 0;

  const subs = listSubscriptions(ctx, user.id, { includeInactive: true });
  const autoPaidToday = ctx.db
    .select()
    .from(payments)
    .where(and(eq(payments.dueDate, c.today), eq(payments.source, 'auto'), eq(payments.status, 'paid')))
    .all();
  const events = planNotifications({ today: c.today, settings: getNotifySettings(ctx), subs, summary: getSummary(ctx, user.id, ctx.now()), autoPaidToday });

  let added = 0;
  for (const e of events) {
    const subscriptionId = 'sub' in e ? e.sub.id : undefined;
    added += fanOut(ctx, channels, { key: e.key, type: e.type, subscriptionId }, c.templates[e.type], eventVars(e, c));
  }
  return added;
}

/** One scheduler step: plan today's messages, then send whatever is queued or due for a retry. */
export async function runNotifications(ctx: ServiceCtx): Promise<void> {
  planToday(ctx);
  await deliverQueued(ctx);
}

/**
 * A subscription's amount was edited, or a manual payment differed from the usual amount.
 * Queued at once; the scheduler sends it within a minute.
 */
export function notifyPriceChange(ctx: ServiceCtx, sub: SubscriptionRow, oldMinor: number, newMinor: number, paidDate: string | null): void {
  if (oldMinor === newMinor || !getNotifySettings(ctx).priceChange) return;
  const channels = listChannels(ctx).filter((ch) => ch.enabled);
  if (channels.length === 0) return;
  const c = context(ctx);
  const key = `priceChange:${sub.id}:${paidDate ?? ctx.now().toISOString()}:${oldMinor}>${newMinor}`;
  fanOut(ctx, channels, { key, type: 'priceChange', subscriptionId: sub.id }, c.templates.priceChange, priceChangeVars(sub, { oldMinor, newMinor, paidDate, appUrl: c.appUrl }, c.f));
}

/** "Send test" on a channel: the test template, sent now. Null on success, otherwise the service's error. */
export async function sendChannelTest(ctx: ServiceCtx, channel: ChannelRow): Promise<string | null> {
  const c = context(ctx);
  const msg = renderMessage(channel.type as ChannelType, 'test', c.templates.test, testVars(channel.name, c.appUrl));
  const error = await sendDirect(ctx, channel, msg);
  if (channel.id) recordDirect(ctx, channel, msg, error);
  return error;
}

/** "Send test to …" in the template editor: the given (possibly unsaved) template with sample data. */
export async function sendTemplateTest(ctx: ServiceCtx, channel: ChannelRow, type: NotifyType, tpl: TemplateText): Promise<string | null> {
  const c = context(ctx);
  const vars = sampleVars(type, { today: c.today, base: c.s.baseCurrency, appUrl: c.appUrl, channel: channel.name }, c.f);
  const msg = renderMessage(channel.type as ChannelType, type, tpl, vars);
  const error = await sendDirect(ctx, channel, msg);
  recordDirect(ctx, channel, msg, error);
  return error;
}
