import type { Cycle } from '../../../shared/schedule.js';
import type { VarFormat } from '../../../shared/notify/vars.js';
import { translate, type Locale } from '../../i18n/index.js';

/** Minor units in a currency, with the currency's own number of decimals. */
export function formatAmount(minor: number, currency: string, locale: Locale): string {
  const opts = { style: 'currency', currency } as const;
  let fmt: Intl.NumberFormat;
  try {
    fmt = new Intl.NumberFormat(locale, opts);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
  return fmt.format(minor / 10 ** (fmt.resolvedOptions().maximumFractionDigits ?? 2));
}

const UNIT: Record<Cycle, string> = { weekly: 'week', monthly: 'month', yearly: 'year' };

export function varFormat(locale: Locale): VarFormat {
  return {
    locale,
    money: (minor, currency) => formatAmount(minor, currency, locale),
    cycle: (cycle, n) => (n === 1 ? translate(locale, `cycleLabel.${UNIT[cycle]}`) : translate(locale, `cycleLabel.${UNIT[cycle]}N`, { n })),
  };
}
