import { t, type Locale } from '../i18n';

/** Today as YYYY-MM-DD in the given IANA zone. */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

const fmt = (iso: string, locale: Locale, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

/** "22 Kas" / "Nov 22". */
export const shortDate = (iso: string, locale: Locale) => fmt(iso, locale, { day: 'numeric', month: 'short' });
/** "Cmt" / "Sat". */
export const weekday = (iso: string, locale: Locale) => fmt(iso, locale, { weekday: 'short' });
/** "Kasım" / "November". */
export const monthName = (iso: string, locale: Locale) => fmt(iso, locale, { month: 'long' });
/** "19 Kasım Perşembe". */
export const longDate = (iso: string, locale: Locale) => fmt(iso, locale, { day: 'numeric', month: 'long', weekday: 'long' });

/** "bugün", "yarın", "3 gün sonra", "2 gün gecikti". */
export function relativeDue(daysLeft: number): string {
  if (daysLeft < 0) return t('rel.late', { n: -daysLeft });
  if (daysLeft === 0) return t('rel.today');
  if (daysLeft === 1) return t('rel.tomorrow');
  return t('rel.inDays', { n: daysLeft });
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** "20 Kasım 2026 14:05" / "November 20, 2026 at 2:05 PM" for an ISO timestamp, in the given zone. */
export const dateTimeIn = (iso: string, locale: Locale, timeZone: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short', timeZone }).format(new Date(iso));

/**
 * When something happened, for activity lines: relative while recent ("3 saat önce", "dün"),
 * then a date in the user's zone ("12 Kas", or "12 Kas 2025" in another year).
 */
export function whenIn(iso: string, locale: Locale, timeZone: string, now = new Date()): string {
  const then = new Date(iso);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const mins = Math.round((now.getTime() - then.getTime()) / 60_000);
  if (mins < 1) return rtf.format(0, 'second');
  if (mins < 60) return rtf.format(-mins, 'minute');
  if (mins < 60 * 24) return rtf.format(-Math.round(mins / 60), 'hour');
  const days = daysBetween(todayIn(timeZone, then), todayIn(timeZone, now));
  if (days < 7) return rtf.format(-days, 'day');
  const sameYear = todayIn(timeZone, then).slice(0, 4) === todayIn(timeZone, now).slice(0, 4);
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }), timeZone }).format(then);
}
