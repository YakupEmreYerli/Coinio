// Builds the variables a notification template sees. Shared by the server (real messages) and the
// web app (live preview with sample data), so the preview always matches what is sent.
import type { Locale } from '../locales';
import type { Cycle } from '../schedule';
import type { TemplateVars } from './template';
import type { NotifyType } from './types';

export type VarFormat = {
  locale: Locale;
  /** Formats minor units in a currency (the app's own money helper). */
  money: (minor: number, currency: string) => string;
  /** "Every month", "Every 3 months"… */
  cycle: (cycle: Cycle, intervalCount: number) => string;
};

export type SubLike = {
  id: number;
  name: string;
  amountMinor: number;
  currency: string;
  cycle: Cycle;
  intervalCount: number;
  autoPay: boolean;
  category: string | null;
  paymentMethod: string | null;
  notes: string | null;
  domain: string | null;
};

const dayNumber = (date: string) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / 86_400_000;
};
export const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from);
export const addDays = (date: string, days: number) => new Date((dayNumber(date) + days) * 86_400_000).toISOString().slice(0, 10);

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** "December 1, 2026", "1 Aralık 2026"… */
export function formatNotifyDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(utc(iso));
}

/** "Nov 20 – 26, 2026" */
export function formatPeriod(from: string, to: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).formatRange(utc(from), utc(to));
}

/** "tomorrow", "in 3 days", "2 days ago" in the user's language, so templates need no plural rules. */
export function relativeDays(days: number, locale: Locale): string {
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day');
}

export const subscriptionLink = (appUrl: string | null, id: number) => (appUrl ? `${appUrl.replace(/\/$/, '')}/subscriptions/${id}` : '');

export function subscriptionVars(
  sub: SubLike,
  o: { dueDate: string; today: string; baseMinor: number | null; base: string; appUrl: string | null },
  f: VarFormat,
): TemplateVars {
  const daysLeft = daysBetween(o.today, o.dueDate);
  return {
    name: sub.name,
    amount: f.money(sub.amountMinor, sub.currency),
    amountMain: sub.currency !== o.base && o.baseMinor !== null ? f.money(o.baseMinor, o.base) : '',
    dueDate: formatNotifyDate(o.dueDate, f.locale),
    when: relativeDays(daysLeft, f.locale),
    daysLeft,
    cycle: f.cycle(sub.cycle, sub.intervalCount),
    category: sub.category ?? '',
    paymentMethod: sub.paymentMethod ?? '',
    notes: sub.notes ?? '',
    website: sub.domain ?? '',
    link: subscriptionLink(o.appUrl, sub.id),
    autoPay: sub.autoPay,
    appUrl: o.appUrl ?? '',
  };
}

export function trialVars(
  sub: SubLike,
  o: { trialEnd: string; today: string; baseMinor: number | null; base: string; appUrl: string | null },
  f: VarFormat,
): TemplateVars {
  return {
    ...subscriptionVars(sub, { ...o, dueDate: o.trialEnd }, f),
    trialEnd: formatNotifyDate(o.trialEnd, f.locale),
  };
}

export type DigestEntry = { sub: SubLike; dueDate: string; baseMinor: number | null };

export function digestVars(
  o: { from: string; to: string; today: string; items: DigestEntry[]; overdue: DigestEntry[]; base: string; appUrl: string | null },
  f: VarFormat,
): TemplateVars {
  const entry = (e: DigestEntry) => subscriptionVars(e.sub, { dueDate: e.dueDate, today: o.today, baseMinor: e.baseMinor, base: o.base, appUrl: o.appUrl }, f);
  const sum = (list: DigestEntry[]) => list.reduce((s, e) => s + (e.baseMinor ?? 0), 0);
  return {
    period: formatPeriod(o.from, o.to, f.locale),
    total: f.money(sum(o.items), o.base),
    items: o.items.map(entry),
    hasOverdue: o.overdue.length > 0,
    overdue: o.overdue.map(entry),
    overdueTotal: f.money(sum(o.overdue), o.base),
    appUrl: o.appUrl ?? '',
  };
}

export function budgetVars(
  o: { month: string; budgetMinor: number; spentMinor: number; projectedMinor: number; base: string; appUrl: string | null },
  f: VarFormat,
): TemplateVars {
  return {
    month: new Intl.DateTimeFormat(f.locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utc(`${o.month}-01`)),
    budget: f.money(o.budgetMinor, o.base),
    spent: f.money(o.spentMinor, o.base),
    projected: f.money(o.projectedMinor, o.base),
    over: f.money(Math.max(0, Math.max(o.projectedMinor, o.spentMinor) - o.budgetMinor), o.base),
    appUrl: o.appUrl ?? '',
  };
}

export function priceChangeVars(
  sub: SubLike,
  o: { oldMinor: number; newMinor: number; paidDate: string | null; appUrl: string | null },
  f: VarFormat,
): TemplateVars {
  const pct = o.oldMinor > 0 ? ((o.newMinor - o.oldMinor) / o.oldMinor) * 100 : null;
  const change = pct === null
    ? ''
    : new Intl.NumberFormat(f.locale, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(pct / 100);
  return {
    name: sub.name,
    oldAmount: f.money(o.oldMinor, sub.currency),
    newAmount: f.money(o.newMinor, sub.currency),
    change,
    paidDate: o.paidDate ? formatNotifyDate(o.paidDate, f.locale) : '',
    cycle: f.cycle(sub.cycle, sub.intervalCount),
    category: sub.category ?? '',
    paymentMethod: sub.paymentMethod ?? '',
    website: sub.domain ?? '',
    link: subscriptionLink(o.appUrl, sub.id),
    appUrl: o.appUrl ?? '',
  };
}

export const testVars = (channel: string, appUrl: string | null): TemplateVars => ({ channel, appUrl: appUrl ?? '' });

/** Made-up data for the template preview and for "send test" of a template. */
export function sampleVars(
  type: NotifyType,
  o: { today: string; base: string; appUrl: string | null; channel?: string; names?: [string, string, string] },
  f: VarFormat,
): TemplateVars {
  const [n1, n2, n3] = o.names ?? ['Netflix', 'Spotify', 'iCloud+'];
  const foreign = o.base === 'USD' ? 'EUR' : 'USD';
  const sub = (id: number, name: string, amountMinor: number, currency: string, extra: Partial<SubLike> = {}): SubLike => ({
    id, name, amountMinor, currency, cycle: 'monthly', intervalCount: 1, autoPay: true, category: null, paymentMethod: null, notes: null, domain: null, ...extra,
  });
  const main = sub(1, n1, 1599, foreign, { domain: 'netflix.com', paymentMethod: 'Visa •• 4242', category: 'Streaming' });
  const common = { today: o.today, base: o.base, appUrl: o.appUrl };
  switch (type) {
    case 'reminder':
      return subscriptionVars(main, { ...common, dueDate: addDays(o.today, 3), baseMinor: 1759 }, f);
    case 'dueToday':
      return subscriptionVars(main, { ...common, dueDate: o.today, baseMinor: 1759 }, f);
    case 'overdue':
      return subscriptionVars({ ...main, autoPay: false }, { ...common, dueDate: addDays(o.today, -1), baseMinor: 1759 }, f);
    case 'trialEnding':
      return trialVars(main, { ...common, trialEnd: addDays(o.today, 3), baseMinor: 1759 }, f);
    case 'digest':
      return digestVars({
        ...common,
        from: o.today,
        to: addDays(o.today, 6),
        items: [
          { sub: main, dueDate: addDays(o.today, 1), baseMinor: 1759 },
          { sub: sub(2, n2, 1099, o.base), dueDate: addDays(o.today, 3), baseMinor: 1099 },
        ],
        overdue: [{ sub: sub(3, n3, 299, o.base, { autoPay: false }), dueDate: addDays(o.today, -2), baseMinor: 299 }],
      }, f);
    case 'budgetExceeded':
      return budgetVars({ ...common, month: o.today.slice(0, 7), budgetMinor: 20000, spentMinor: 15400, projectedMinor: 23150 }, f);
    case 'priceChange':
      return priceChangeVars(main, { oldMinor: 1599, newMinor: 1799, paidDate: null, appUrl: o.appUrl }, f);
    case 'test':
      return testVars(o.channel ?? 'Telegram', o.appUrl);
  }
}
