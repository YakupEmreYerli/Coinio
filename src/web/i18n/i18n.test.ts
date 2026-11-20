import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from './en.json';
import tr from './tr.json';
import { LOCALES, formatDate, formatMoney, resolveLocale, setLocale, t, type Catalog, type Locale, type Message } from './index';

const read = (dir: string) => (locale: Locale): Catalog => JSON.parse(readFileSync(join(process.cwd(), dir, `${locale}.json`), 'utf8')) as Catalog;
const catalog = read('src/web/i18n');
const serverCatalog = read('src/server/i18n');

/** The plural forms a language actually uses for whole numbers ("one", "other", …; only "other" in ja and zh). */
const pluralForms = (locale: Locale) => {
  const rules = new Intl.PluralRules(locale);
  return [...new Set(Array.from({ length: 201 }, (_, n) => rules.select(n)))].sort();
};
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const tags = (s: string) => [...s.matchAll(/<\/?\w+>/g)].map((m) => m[0]).sort();
const forms = (m: Message): string[] => (typeof m === 'string' ? [m] : Object.values(m));

describe.each([
  ['web', catalog],
  ['server', serverCatalog],
] as const)('%s catalogs', (_name, load) => {
  const source = load('en');

  describe.each(LOCALES.filter((l) => l !== 'en'))('%s', (locale) => {
    const target = load(locale);

    it('has exactly the English keys', () => {
      expect(Object.keys(target).sort()).toEqual(Object.keys(source).sort());
    });

    it('keeps every placeholder and tag', () => {
      for (const [key, message] of Object.entries(source)) {
        const want = forms(message).at(-1)!;
        for (const form of forms(target[key] ?? '')) {
          expect(placeholders(form), `${key}: ${form}`).toEqual(placeholders(want));
          expect(tags(form), `${key}: ${form}`).toEqual(tags(want));
        }
      }
    });

    it("uses plurals where English does, with the language's own forms", () => {
      for (const [key, message] of Object.entries(source)) {
        const got = target[key];
        if (typeof message === 'string') expect(typeof got, key).toBe('string');
        else expect(Object.keys(got ?? {}).sort(), key).toEqual(pluralForms(locale));
      }
    });

    it('has no empty strings', () => {
      for (const [key, message] of Object.entries(target)) for (const form of forms(message)) expect(form.trim(), key).not.toBe('');
    });
  });

  it('English plurals have one and other', () => {
    for (const [key, message] of Object.entries(source)) if (typeof message !== 'string') expect(Object.keys(message).sort(), key).toEqual(['one', 'other']);
  });
});

describe('i18n', () => {
  it('formats money from minor units', () => {
    expect(formatMoney(99999, 'TRY', 'tr')).toBe('₺999,99');
    expect(formatMoney(1050, 'USD', 'en')).toBe('$10.50');
    expect(formatMoney(123456, 'EUR', 'de')).toBe('1.234,56\u00a0€');
    expect(formatMoney(1050, 'JPY', 'ja')).toBe('￥11');
  });

  it('formats ISO dates without shifting the day', () => {
    expect(formatDate('2026-03-01', 'en')).toBe('Mar 1, 2026');
    expect(formatDate('2026-03-01', 'tr')).toBe('1 Mar 2026');
    expect(formatDate('2026-03-01', 'de')).toBe('01.03.2026');
    expect(formatDate('2026-03-01', 'ja')).toBe('2026/03/01');
  });

  it('resolves locale: setting, then browser language, then en', () => {
    expect(resolveLocale('tr', ['en-US'])).toBe('tr');
    expect(resolveLocale(null, ['tr-TR', 'en'])).toBe('tr');
    expect(resolveLocale(null, ['de-DE'])).toBe('de');
    expect(resolveLocale(null, ['pt-PT'])).toBe('pt-BR');
    expect(resolveLocale(null, ['zh-TW'])).toBe('zh-CN');
    expect(resolveLocale(null, ['ko-KR', 'ja-JP'])).toBe('ja');
    expect(resolveLocale(null, ['ko-KR'])).toBe('en');
    expect(resolveLocale('xx', [])).toBe('en');
  });

  it('translates with variables and falls back to the key', () => {
    setLocale('en');
    expect(t('login.title')).toBe(en['login.title' as keyof typeof en]);
    expect(t('setup.passwordHint', { min: 10 })).toBe('At least 10 characters.');
    expect(t('does.not.exist')).toBe('does.not.exist');
    setLocale('tr');
    expect(t('login.title')).toBe(tr['login.title' as keyof typeof tr]);
    setLocale('en');
  });

  it('picks the plural form from n in each language', () => {
    setLocale('en');
    expect(t('calendar.count', { n: 1 })).toBe('1 payment');
    expect(t('calendar.count', { n: 3 })).toBe('3 payments');
    setLocale('fr');
    expect(t('calendar.count', { n: 0 })).toBe(t('calendar.count', { n: 1 }).replace('1', '0'));
    setLocale('ja');
    expect(t('calendar.count', { n: 1 })).toContain('1');
    setLocale('en');
  });
});
