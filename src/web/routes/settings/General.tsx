import { CurrencyPicker, TimeZonePicker } from '../../components/pickers/Pickers';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { t } from '../../i18n';
import { useSettings, useUpdateSettings } from '../../lib/hooks';
import { Section } from './Section';

export function General() {
  const s = useSettings().data;
  const save = useUpdateSettings();
  if (!s) return null;
  return (
    <Section title={t('settings.general')} description={t('settings.generalDesc')}>
      <CurrencyPicker value={s.baseCurrency} onChange={(v) => v !== s.baseCurrency && save.mutate({ baseCurrency: v })} hint={t('settings.baseCurrencyHint')} />
      <TimeZonePicker value={s.timezone} onChange={(v) => v !== s.timezone && save.mutate({ timezone: v })} hint={t('settings.timezoneHint')} />
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t('settings.language')}</span>
        <SegmentedControl label={t('settings.language')} value={s.locale} onChange={(v) => save.mutate({ locale: v })} options={[{ value: 'tr', label: 'Türkçe' }, { value: 'en', label: 'English' }]} />
      </div>
    </Section>
  );
}
