import { useMemo } from 'react';
import { t, useLocale } from '../../i18n';
import { browserZone, currencyOptions, guessCurrency, zoneOptions } from './data';
import { SearchPicker, type PickerItem } from './SearchPicker';

const symbolBadge = (symbol: string) => (
  <span className="grid h-7 min-w-7 shrink-0 place-items-center rounded-[7px] bg-sunk px-1 text-[12.5px] font-semibold text-text-2">{symbol}</span>
);

/** Searchable currency list: code, localized name and symbol; the guess for this browser and the usual ones first. */
export function CurrencyPicker({ value, onChange, label = t('settings.baseCurrency'), hint }: { value: string; onChange: (code: string) => void; label?: string; hint?: string }) {
  const { locale } = useLocale();
  const items = useMemo<PickerItem[]>(
    () => currencyOptions(locale).map((c) => ({ value: c.code, label: c.name, sub: undefined, meta: c.code, leading: symbolBadge(c.symbol), keywords: [c.code, c.symbol] })),
    [locale],
  );
  const suggested = [...new Set([guessCurrency(), 'TRY', 'USD', 'EUR', 'GBP'])];
  return (
    <SearchPicker
      label={label}
      value={value}
      onChange={onChange}
      items={items.some((i) => i.value === value) ? items : [{ value, label: value, meta: value }, ...items]}
      suggested={suggested}
      suggestedHeading={t('picker.suggested')}
      allHeading={t('picker.allCurrencies')}
      searchPlaceholder={t('picker.searchCurrency')}
      emptyText={t('picker.noMatch')}
      hint={hint}
      renderValue={(item) => (
        <>
          {item?.leading}
          <span className="truncate">{item?.label ?? value}</span>
          <span className="num ml-auto text-xs text-text-3">{value}</span>
        </>
      )}
    />
  );
}

/** Searchable time zone list with the current UTC offset and local time; the browser's zone is suggested. */
export function TimeZonePicker({ value, onChange, label = t('settings.timezone'), hint }: { value: string; onChange: (zone: string) => void; label?: string; hint?: string }) {
  const { locale } = useLocale();
  const items = useMemo<PickerItem[]>(() => {
    const now = new Date();
    return zoneOptions(now).map((z) => ({
      value: z.id,
      label: z.city,
      sub: z.region || undefined,
      meta: `${z.offset} · ${new Intl.DateTimeFormat(locale, { timeZone: z.id, hour: '2-digit', minute: '2-digit' }).format(now)}`,
      keywords: [z.id, z.region, z.offset],
    }));
  }, [locale]);
  const detected = browserZone();
  return (
    <SearchPicker
      label={label}
      value={value}
      onChange={onChange}
      items={items}
      suggested={[detected]}
      suggestedHeading={t('picker.detected')}
      allHeading={t('picker.allZones')}
      searchPlaceholder={t('picker.searchZone')}
      emptyText={t('picker.noMatch')}
      hint={hint}
      renderValue={(item) => (
        <>
          <span className="truncate">{item?.label ?? value}</span>
          {item?.sub && <span className="truncate text-text-3">{item.sub}</span>}
          <span className="num ml-auto shrink-0 text-xs text-text-3">{item?.meta}</span>
        </>
      )}
    />
  );
}
