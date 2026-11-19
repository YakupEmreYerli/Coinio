import { Select } from '../../components/ui/Select';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Input } from '../../components/ui/Input';
import { t } from '../../i18n';
import { useSettings, useUpdateSettings } from '../../lib/hooks';
import { Section } from './Section';
import { useState, useEffect } from 'react';

const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP', 'CHF', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'AZN', 'BGN'];
const ZONES: string[] = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? ['UTC'];

export function General() {
  const s = useSettings().data;
  const save = useUpdateSettings();
  const [tz, setTz] = useState('');
  useEffect(() => setTz(s?.timezone ?? ''), [s?.timezone]);
  if (!s) return null;
  return (
    <Section title={t('settings.general')} description={t('settings.generalDesc')}>
      <Select label={t('settings.baseCurrency')} value={s.baseCurrency} onChange={(v) => save.mutate({ baseCurrency: v })} options={[...new Set([s.baseCurrency, ...CURRENCIES])].map((c) => ({ value: c, label: c }))} />
      <p className="-mt-2 text-xs text-text-3">{t('settings.baseCurrencyHint')}</p>
      <Input
        label={t('settings.timezone')}
        list="st-zones"
        value={tz}
        onChange={(e) => setTz(e.target.value)}
        onBlur={() => ZONES.includes(tz) && tz !== s.timezone && save.mutate({ timezone: tz })}
        hint={t('settings.timezoneHint')}
      />
      <datalist id="st-zones">{ZONES.map((z) => <option key={z} value={z} />)}</datalist>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t('settings.language')}</span>
        <SegmentedControl label={t('settings.language')} value={s.locale} onChange={(v) => save.mutate({ locale: v })} options={[{ value: 'tr', label: 'Türkçe' }, { value: 'en', label: 'English' }]} />
      </div>
    </Section>
  );
}
