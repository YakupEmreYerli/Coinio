import { isLocale, parseAcceptLanguage, pickLocale, type Locale } from '../../shared/locales.js';
import de from './de.json';
import en from './en.json';
import es from './es.json';
import fr from './fr.json';
import ja from './ja.json';
import ptBR from './pt-BR.json';
import tr from './tr.json';
import zhCN from './zh-CN.json';

export type { Locale };
type Message = string | Partial<Record<Intl.LDMLPluralRule, string>>;

// Strings end users see from the server: the OAuth sign-in and consent pages and words used in notifications.
const catalogs: Record<Locale, Record<string, Message>> = { en, tr, de, fr, es, 'pt-BR': ptBR, 'zh-CN': zhCN, ja };

/** A saved setting → a supported locale (English when unset or unknown). */
export const toLocale = (value: unknown): Locale => (isLocale(value) ? value : 'en');

/** The first supported language in an Accept-Language header; English otherwise. */
export const localeFromAcceptLanguage = (header: string | undefined): Locale => pickLocale(parseAcceptLanguage(header));

/** Looks up a key; plural messages choose their form from `vars.n`. Variables are inserted as given (escape first). */
export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const pick = (m: Message | undefined) => {
    if (m === undefined || typeof m === 'string') return m;
    const form = typeof vars?.n === 'number' ? new Intl.PluralRules(locale).select(vars.n) : 'other';
    return m[form] ?? m.other;
  };
  const template = pick(catalogs[locale][key]) ?? pick(catalogs.en[key]) ?? key;
  return vars ? template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : template;
}
