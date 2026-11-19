import { describe, expect, it } from 'vitest';
import en from './en.json';
import tr from './tr.json';
import { formatDate, formatMoney, resolveLocale, setLocale, t } from './index';

describe('i18n', () => {
  it('has identical key sets in en and tr', () => {
    expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort());
  });

  it('formats money from minor units', () => {
    expect(formatMoney(99999, 'TRY', 'tr')).toBe('₺999,99');
    expect(formatMoney(1050, 'USD', 'en')).toBe('$10.50');
  });

  it('formats ISO dates without shifting the day', () => {
    expect(formatDate('2026-03-01', 'en')).toBe('Mar 1, 2026');
    expect(formatDate('2026-03-01', 'tr')).toBe('1 Mar 2026');
  });

  it('resolves locale: setting, then browser language, then en', () => {
    expect(resolveLocale('tr', ['en-US'])).toBe('tr');
    expect(resolveLocale(null, ['tr-TR', 'en'])).toBe('tr');
    expect(resolveLocale(null, ['de-DE'])).toBe('en');
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
});
