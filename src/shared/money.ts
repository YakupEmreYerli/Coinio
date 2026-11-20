/**
 * Amounts are integers in the currency's smallest unit (`amountMinor`): cents for USD, whole yen for JPY,
 * fils for KWD. The exponent comes from ISO 4217, not from Intl: CLDR rounds some currencies for display
 * (HUF, IDR, COP...) and that differs between ICU versions, while stored amounts must never change meaning.
 */
const ISO_DIGITS: Record<string, number> = {
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0, RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  CLF: 4, UYW: 4,
};

/** Decimal places of a currency's minor unit (JPY 0, USD 2, KWD 3). */
export const minorDigits = (currency: string): number => ISO_DIGITS[currency] ?? 2;

type IntlWithValues = { supportedValuesOf?: (key: string) => string[] };
let known: Set<string> | null = null;

/** A real ISO 4217 code the runtime knows (Intl formats any three letters, so check its list). */
export function isSupportedCurrency(code: string): boolean {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  known ??= new Set((Intl as unknown as IntlWithValues).supportedValuesOf?.('currency') ?? []);
  if (known.size) return known.has(code);
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: code });
    return true;
  } catch {
    return false;
  }
}

/** Minor units of `from` into minor units of `to`, where one `from` is worth `rate` of `to`. */
export function convertMinor(amountMinor: number, from: string, to: string, rate: number): number {
  const shift = minorDigits(to) - minorDigits(from);
  return Math.round(shift >= 0 ? amountMinor * rate * 10 ** shift : (amountMinor * rate) / 10 ** -shift);
}

/** Minor units as a plain decimal ("1234.56", "1500" for yen), without float rounding. */
export function minorToDecimal(minor: number, currency: string): string {
  const d = minorDigits(currency);
  const sign = minor < 0 ? '-' : '';
  const s = String(Math.abs(minor)).padStart(d + 1, '0');
  return d === 0 ? `${sign}${s}` : `${sign}${s.slice(0, -d)}.${s.slice(-d)}`;
}

/** A decimal amount (229.99) as minor units; null when it has more decimals than the currency. */
export function decimalToMinor(amount: number, currency: string): number | null {
  const scaled = amount * 10 ** minorDigits(currency);
  const minor = Math.round(scaled);
  return Math.abs(scaled - minor) < 1e-6 ? minor : null;
}

/** Formats minor units in `locale` with the currency's own number of decimals; `options` can override them. */
export function formatMinor(minor: number, currency: string, locale: string, options: Intl.NumberFormatOptions = {}): string {
  return currencyFormat(currency, locale, options).format(minor / 10 ** minorDigits(currency));
}

/** The Intl formatter `formatMinor` uses, for callers that need `formatToParts`. */
export function currencyFormat(currency: string, locale: string, options: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
  const d = minorDigits(currency);
  const max = options.maximumFractionDigits ?? d;
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: Math.min(d, max), maximumFractionDigits: max, ...options });
}
