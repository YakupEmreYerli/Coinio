import { useSyncExternalStore } from 'react';
import en from './en.json';
import tr from './tr.json';

export type Locale = 'en' | 'tr';
const catalogs: Record<Locale, Record<string, string>> = { en, tr };

const isLocale = (v: unknown): v is Locale => v === 'en' || v === 'tr';

/** Priority: saved setting, then browser language, then English. */
export function resolveLocale(setting: string | null | undefined, browserLanguages: readonly string[]): Locale {
  if (isLocale(setting)) return setting;
  for (const lang of browserLanguages) {
    const base = lang.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return 'en';
}

let current: Locale = resolveLocale(null, typeof navigator === 'undefined' ? [] : navigator.languages);
const listeners = new Set<() => void>();

export function setLocale(locale: Locale): void {
  if (locale === current) return;
  current = locale;
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  listeners.forEach((l) => l());
}

export function getLocale(): Locale {
  return current;
}

export function useLocale(): { locale: Locale; setLocale: (l: Locale) => void } {
  const locale = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getLocale,
  );
  return { locale, setLocale };
}

export type Vars = Record<string, string | number>;

export function t(key: string, vars?: Vars): string {
  const template = catalogs[current][key] ?? catalogs.en[key] ?? key;
  return vars ? template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : template;
}

/** Money is stored as integer minor units (2 decimals). */
export function formatMoney(minor: number, currency: string, locale: Locale): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100);
}

/** Formats a YYYY-MM-DD string; pinned to UTC so the day never shifts with the viewer's timezone. */
export function formatDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}
