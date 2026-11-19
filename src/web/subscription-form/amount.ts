import type { Locale } from '../i18n';

const intPart = (s: string, grp: string) => {
  const g = grp === '.' ? '\\.' : grp;
  return new RegExp(`^(\\d+|\\d{1,3}(${g}\\d{3})+)$`).test(s);
};

/**
 * Typed amount → minor units. Accepts the locale's grouping and decimal marks ("1.234,50" in tr,
 * "1,234.50" in en) and a lone other mark before 1-2 digits as decimal ("99.99" in tr). Null if unclear.
 */
export function parseAmount(text: string, locale: Locale): number | null {
  if (text.includes('-')) return null;
  const s = text.replace(/[^\d.,]/g, '');
  if (!s) return null;
  const dec = locale === 'tr' ? ',' : '.';
  const grp = locale === 'tr' ? '.' : ',';
  let whole: string;
  let frac = '';
  if (s.includes(dec)) {
    const parts = s.split(dec);
    if (parts.length !== 2 || !/^\d{1,2}$/.test(parts[1]!)) return null;
    [whole, frac] = parts as [string, string];
    if (!intPart(whole, grp)) return null;
    whole = whole.split(grp).join('');
  } else if (s.includes(grp)) {
    if (intPart(s, grp)) whole = s.split(grp).join('');
    else {
      const m = new RegExp(`^(\\d+)${grp === '.' ? '\\.' : grp}(\\d{1,2})$`).exec(s);
      if (!m) return null;
      whole = m[1]!;
      frac = m[2]!;
    }
  } else whole = s;
  return Number(whole) * 100 + Number(frac.padEnd(2, '0') || '0');
}

/** Minor units → plain editable text ("1234,50"), no grouping. */
export function formatAmountInput(minor: number, locale: Locale): string {
  const s = (minor / 100).toFixed(2);
  return locale === 'tr' ? s.replace('.', ',') : s;
}
