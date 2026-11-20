import type { Locale } from '../../i18n';

type IntlWithValues = { supportedValuesOf?: (key: string) => string[] };
const supported = (key: string): string[] => (Intl as unknown as IntlWithValues).supportedValuesOf?.(key) ?? [];

const EURO = ['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'IE', 'PT', 'FI', 'GR', 'SK', 'SI', 'EE', 'LV', 'LT', 'LU', 'MT', 'CY', 'HR'];
const REGION_CURRENCY: Record<string, string> = {
  TR: 'TRY', GB: 'GBP', US: 'USD', CH: 'CHF', CA: 'CAD', AU: 'AUD', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN',
  CZ: 'CZK', JP: 'JPY', IN: 'INR', BR: 'BRL', MX: 'MXN', AZ: 'AZN', BG: 'BGN', RO: 'RON', HU: 'HUF', NZ: 'NZD',
};

/** Currency guess from the browser region (en-GB → GBP, de-DE → EUR); USD when unknown or zero-decimal. */
export function guessCurrency(languages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages): string {
  for (const lang of languages) {
    const region = (lang.split('-')[1] ?? '').toUpperCase();
    if (EURO.includes(region)) return 'EUR';
    const code = REGION_CURRENCY[region];
    if (code && twoDecimals(code)) return code;
  }
  return 'USD';
}

/** Coinio stores money in hundredths, so only currencies with exactly two decimals can be used. */
export function twoDecimals(code: string): boolean {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits === 2;
  } catch {
    return false;
  }
}

export type CurrencyOption = { code: string; name: string; symbol: string };

const FALLBACK_CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP', 'CHF', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'AZN', 'BGN'];

export function currencyOptions(locale: Locale): CurrencyOption[] {
  const names = new Intl.DisplayNames(locale, { type: 'currency' });
  const codes = supported('currency');
  return (codes.length ? codes : FALLBACK_CURRENCIES)
    .filter(twoDecimals)
    .map((code) => {
      const name = names.of(code) ?? code;
      const symbol =
        new Intl.NumberFormat(locale, { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? code;
      return { code, name, symbol };
    })
    // Codes Intl cannot name are historic or special (XAU, XTS…); nobody pays a subscription in them.
    .filter((c) => c.name !== c.code)
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

export const browserZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export type ZoneOption = { id: string; city: string; region: string; offset: string; minutes: number };

/** "GMT+3" style offset of a zone right now, plus its value in minutes for sorting. */
export function zoneOffset(id: string, at: Date = new Date()): { label: string; minutes: number } {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: id, timeZoneName: 'shortOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(part);
  const minutes = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
  return { label: part === 'GMT' ? 'GMT' : part, minutes };
}

export function zoneOptions(at: Date = new Date()): ZoneOption[] {
  const ids = supported('timeZone');
  return (ids.length ? ids : ['UTC'])
    .map((id) => {
      const parts = id.split('/');
      const { label, minutes } = zoneOffset(id, at);
      return { id, city: parts[parts.length - 1]!.replace(/_/g, ' '), region: parts.length > 1 ? parts.slice(0, -1).join(' / ').replace(/_/g, ' ') : '', offset: label, minutes };
    })
    .sort((a, b) => a.minutes - b.minutes || a.city.localeCompare(b.city));
}

export function isZone(id: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: id });
    return true;
  } catch {
    return false;
  }
}
