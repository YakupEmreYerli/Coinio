import { useSyncExternalStore } from 'react';
import { LOCALES, isLocale, pickLocale, type Locale } from '../../shared/locales';
import en from './en.json';

export { LOCALES, LOCALE_NAMES, isLocale } from '../../shared/locales';
export type { Locale };

/** A string, or its plural forms by CLDR category ("one", "other", …). */
export type Message = string | Partial<Record<Intl.LDMLPluralRule, string>>;
export type Catalog = Record<string, Message>;

// English ships in the main bundle; the other languages load on first use.
const loaders = import.meta.glob<{ default: Catalog }>(['./*.json', '!./en.json']);
const catalogs: Partial<Record<Locale, Catalog>> & { en: Catalog } = { en };

export async function loadLocale(locale: Locale): Promise<void> {
  if (catalogs[locale]) return;
  const load = loaders[`./${locale}.json`];
  if (load) catalogs[locale] = (await load()).default;
}

/** Every language at once (tests). */
export const loadAllLocales = () => Promise.all(LOCALES.map(loadLocale));

/** Priority: saved setting, then browser language, then English. */
export function resolveLocale(setting: string | null | undefined, browserLanguages: readonly string[]): Locale {
  return isLocale(setting) ? setting : pickLocale(browserLanguages);
}

let current: Locale = resolveLocale(null, typeof navigator === 'undefined' ? [] : navigator.languages);
let requested: Locale = current;
if (typeof document !== 'undefined') document.documentElement.lang = current;
const listeners = new Set<() => void>();

function apply(locale: Locale): void {
  if (locale === current) return;
  current = locale;
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  listeners.forEach((l) => l());
}

/** Switches at once when the language is loaded, otherwise as soon as it arrives. */
export function setLocale(locale: Locale): void {
  requested = locale;
  if (catalogs[locale]) return apply(locale);
  void loadLocale(locale).then(() => {
    if (requested === locale) apply(locale);
  });
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

const pluralRules = new Map<Locale, Intl.PluralRules>();
const pluralOf = (locale: Locale, n: number) => {
  let rules = pluralRules.get(locale);
  if (!rules) pluralRules.set(locale, (rules = new Intl.PluralRules(locale)));
  return rules.select(n);
};

function pick(message: Message | undefined, locale: Locale, n: unknown): string | undefined {
  if (message === undefined || typeof message === 'string') return message;
  const form = typeof n === 'number' ? pluralOf(locale, n) : 'other';
  return message[form] ?? message.other;
}

/** Looks up a key; plural messages choose their form from `vars.n`. */
export function t(key: string, vars?: Vars): string {
  const template = pick(catalogs[current]?.[key], current, vars?.n) ?? pick(catalogs.en[key], 'en', vars?.n) ?? key;
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
