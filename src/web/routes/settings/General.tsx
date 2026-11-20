import { CurrencyPicker, TimeZonePicker } from '../../components/pickers/Pickers';
import { Select } from '../../components/ui/Select';
import { LOCALES, LOCALE_NAMES, isLocale, t } from '../../i18n';
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
      <Select
        label={t('settings.language')}
        value={s.locale}
        onChange={(v) => isLocale(v) && save.mutate({ locale: v })}
        options={LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l] }))}
      />
    </Section>
  );
}
