import type { Locale } from '../i18n';
import { minorDigits, minorToDecimal } from '../../shared/money';

/** The locale's decimal mark: "," for tr, de, fr, es and pt-BR; "." for en, ja and zh-CN. */
const decimalMark = (locale: Locale) =>
  new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === 'decimal')?.value === ',' ? ',' : '.';

const intPart = (s: string, grp: string) => {
  const g = grp === '.' ? '\\.' : grp;
  return new RegExp(`^(\\d+|\\d{1,3}(${g}\\d{3})+)$`).test(s);
};

/**
 * Typed amount → minor units of `currency`. Accepts the locale's grouping and decimal marks ("1.234,50" in tr
 * and de, "1,234.50" in en and ja) and a lone other mark before up to the currency's decimals as decimal
 * ("99.99" in tr). Currencies without decimals (JPY) take whole numbers only. Null if unclear.
 */
export function parseAmount(text: string, locale: Locale, currency: string): number | null {
  if (text.includes('-')) return null;
  const s = text.replace(/[\s\p{Sc}]/gu, '');
  if (!s || !/^[\d.,]+$/.test(s)) return null;
  const digits = minorDigits(currency);
  const fracOk = (f: string) => /^\d+$/.test(f) && f.length <= digits;
  const dec = decimalMark(locale);
  const grp = dec === ',' ? '.' : ',';
  let whole: string;
  let frac = '';
  if (s.includes(dec)) {
    const parts = s.split(dec);
    if (parts.length !== 2 || !fracOk(parts[1]!)) return null;
    [whole, frac] = parts as [string, string];
    if (!intPart(whole, grp)) return null;
    whole = whole.split(grp).join('');
  } else if (s.includes(grp)) {
    if (intPart(s, grp)) whole = s.split(grp).join('');
    else {
      const m = new RegExp(`^(\\d+)${grp === '.' ? '\\.' : grp}(\\d+)$`).exec(s);
      if (!m || !fracOk(m[2]!)) return null;
      whole = m[1]!;
      frac = m[2]!;
    }
  } else whole = s;
  return Number(whole) * 10 ** digits + Number(frac.padEnd(digits, '0') || '0');
}

/** The phone keyboard for an amount field: digits only when the currency has no decimals. */
export const amountInputMode = (currency: string): 'numeric' | 'decimal' => (minorDigits(currency) ? 'decimal' : 'numeric');

/** Minor units → plain editable text ("1234,50", "1490" for yen), no grouping. */
export function formatAmountInput(minor: number, locale: Locale, currency: string): string {
  const s = minorToDecimal(minor, currency);
  return decimalMark(locale) === ',' ? s.replace('.', ',') : s;
}
