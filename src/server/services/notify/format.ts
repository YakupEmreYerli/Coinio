import type { Cycle } from '../../../shared/schedule.js';
import type { VarFormat } from '../../../shared/notify/vars.js';
import { formatMinor, minorDigits } from '../../../shared/money.js';
import { translate, type Locale } from '../../i18n/index.js';

/** Minor units in a currency, with the currency's own number of decimals (the shared ISO table). */
export function formatAmount(minor: number, currency: string, locale: Locale): string {
  try {
    return formatMinor(minor, currency, locale);
  } catch {
    return `${minor / 10 ** minorDigits(currency)} ${currency}`;
  }
}

const UNIT: Record<Cycle, string> = { weekly: 'week', monthly: 'month', yearly: 'year' };

export function varFormat(locale: Locale): VarFormat {
  return {
    locale,
    money: (minor, currency) => formatAmount(minor, currency, locale),
    cycle: (cycle, n) => (n === 1 ? translate(locale, `cycleLabel.${UNIT[cycle]}`) : translate(locale, `cycleLabel.${UNIT[cycle]}N`, { n })),
  };
}
