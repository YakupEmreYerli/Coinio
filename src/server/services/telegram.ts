import { asc } from 'drizzle-orm';
import { users } from '../db/schema.js';
import { todayIn } from '../../shared/schedule.js';
import { formatMinor, minorToDecimal } from '../../shared/money.js';
import type { DueItem, Summary } from '../domain/summary.js';
import { toLocale, translate, type Locale } from '../i18n/index.js';
import type { ServiceCtx } from './context.js';
import { getInternalValue, getSettings, setInternalValue } from './settings.js';
import { getSummary, listPayments, listSubscriptions } from './subscriptions.js';

export type PaidLike = { name: string; amountMinor: number; currency: string };

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function formatAmount(minor: number, currency: string, locale: Locale): string {
  try {
    return formatMinor(minor, currency, locale);
  } catch {
    return `${minorToDecimal(minor, currency)} ${currency}`;
  }
}

function formatDate(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

/** Pure: the reminder text for one day, or null when there is nothing to say. */
export function buildReminderMessage(input: {
  summary: Summary;
  todayAutoPaid: PaidLike[];
  today: string;
  locale: Locale;
}): string | null {
  const { summary, todayAutoPaid, locale } = input;
  const t = (key: string, n?: number) => escapeHtml(translate(locale, `telegram.${key}`, n === undefined ? undefined : { n }));
  const line = (i: DueItem, note: string) =>
    `${escapeHtml(i.name)} · ${formatDate(i.dueDate, locale)} · ${formatAmount(i.amountMinor, i.currency, locale)} (${note})`;

  const overdue = summary.overdue.map((i) => line(i, t('late', -i.daysLeft)));
  const upcoming = summary.upcoming
    .filter((i) => i.daysLeft <= i.reminderDays)
    .map((i) => {
      const note = i.daysLeft === 0 ? t('today')
        : i.autoPay ? (i.daysLeft === 1 ? t('tomorrow') : t('autoIn', i.daysLeft))
        : t('manualIn', i.daysLeft);
      return line(i, note);
    });
  const paid = todayAutoPaid.map((p) => `${escapeHtml(p.name)} · ${formatAmount(p.amountMinor, p.currency, locale)}`);

  if (!overdue.length && !upcoming.length && !paid.length) return null;
  const section = (title: string, lines: string[]) => (lines.length ? [`<b>${title}</b>`, ...lines, ''] : []);
  return [
    `<b>${t('title')}</b>`,
    '',
    ...section(t('overdue'), overdue),
    ...section(t('upcoming'), upcoming),
    ...section(t('paidToday'), paid),
  ].join('\n').trimEnd();
}

/** Returns true when Telegram answered ok. Never throws, never logs the token. */
export async function sendTelegram(ctx: ServiceCtx, token: string, chatId: string, text: string): Promise<boolean> {
  try {
    const res = await ctx.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendTestMessage(ctx: ServiceCtx): Promise<'sent' | 'not_configured' | 'failed'> {
  const s = getSettings(ctx);
  if (!s.telegramBotToken || !s.telegramChatId) return 'not_configured';
  const ok = await sendTelegram(ctx, s.telegramBotToken, s.telegramChatId, translate(toLocale(s.locale), 'telegram.test'));
  return ok ? 'sent' : 'failed';
}

function localTime(tz: string, now: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
}

/** Sends the daily reminder at most once per local day, after the configured reminder time. */
export async function sendDueReminders(ctx: ServiceCtx): Promise<'sent' | 'skipped' | 'not_configured'> {
  const s = getSettings(ctx);
  if (!s.telegramBotToken || !s.telegramChatId) return 'not_configured';
  const now = ctx.now();
  const today = todayIn(s.timezone, now);
  if (localTime(s.timezone, now) < s.reminderTime || getInternalValue(ctx, 'lastReminderDate') === today) return 'skipped';

  const user = ctx.db.select().from(users).orderBy(asc(users.id)).get();
  if (!user) return 'skipped';

  const locale = toLocale(s.locale);
  const summary = getSummary(ctx, user.id, now);
  const names = new Map(listSubscriptions(ctx, user.id, { includeInactive: true }).map((x) => [x.id, x.name]));
  const todayAutoPaid = listPayments(ctx, user.id)
    .filter((p) => p.dueDate === today && p.source === 'auto' && p.status === 'paid')
    .map((p) => ({ name: names.get(p.subscriptionId) ?? '', amountMinor: p.amountMinor, currency: p.currency }));
  return deliver(ctx, s.telegramBotToken, s.telegramChatId, today, buildReminderMessage({ summary, todayAutoPaid, today, locale }));
}

async function deliver(
  ctx: ServiceCtx, token: string, chatId: string, today: string, text: string | null,
): Promise<'sent' | 'skipped'> {
  if (text === null) {
    setInternalValue(ctx, 'lastReminderDate', today);
    return 'skipped';
  }
  if (!(await sendTelegram(ctx, token, chatId, text))) return 'skipped';
  setInternalValue(ctx, 'lastReminderDate', today);
  return 'sent';
}
