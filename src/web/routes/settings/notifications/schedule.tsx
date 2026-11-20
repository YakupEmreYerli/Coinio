import { useEffect, useState } from 'react';
import { OffsetChips } from '../../../components/OffsetChips';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Switch } from '../../../components/ui/Switch';
import { t, useLocale } from '../../../i18n';
import type { NotifySettings } from '../../../lib/types';
import { formatAmountInput, parseAmount } from '../../../subscription-form/amount';
import { minorDigits } from '../../../../shared/money';
import { Section } from '../Section';

type Props = { value: NotifySettings; onChange: (v: NotifySettings) => void; onSave: () => void; saving: boolean; dirty: boolean };

const SaveButton = ({ onSave, saving, dirty }: Pick<Props, 'onSave' | 'saving' | 'dirty'>) => (
  <Button variant="primary" onClick={onSave} disabled={saving || !dirty}>
    {t('common.save')}
  </Button>
);

export function RemindersCard({ value, onChange, reminderTime, onTimeChange, ...save }: Props & { reminderTime: string; onTimeChange: (v: string) => void }) {
  const cycles = ['weekly', 'monthly', 'yearly'] as const;
  return (
    <Section id="reminders" title={t('notify.reminders')} description={t('notify.remindersDesc')} footer={<SaveButton {...save} />}>
      <Input label={t('notify.time')} type="time" value={reminderTime} onChange={(e) => onTimeChange(e.target.value)} hint={t('notify.timeHint')} className="w-40" />
      <div className="flex flex-col gap-3">
        <span className="text-[13px] font-medium text-text-2">{t('notify.defaultOffsets')}</span>
        {cycles.map((c) => (
          <div key={c} className="grid gap-1.5 sm:grid-cols-[120px_1fr] sm:items-center">
            <span className="text-sm">{t(`notify.cycle.${c}`)}</span>
            <OffsetChips label={t(`notify.cycle.${c}`)} value={value.offsets[c]} onChange={(v) => onChange({ ...value, offsets: { ...value.offsets, [c]: v } })} />
          </div>
        ))}
        <p className="text-xs text-text-3">{t('notify.offsetsHint')}</p>
      </div>
      <Switch checked={value.overdue} onChange={(v) => onChange({ ...value, overdue: v })} label={t('notify.overdue')} description={t('notify.overdueHint')} />
    </Section>
  );
}

function weekdayNames(locale: string): string[] {
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i))));
}

export function DigestsCard({ value, onChange, ...save }: Props) {
  const { locale } = useLocale();
  const days = weekdayNames(locale);
  return (
    <Section id="digests" title={t('notify.digests')} description={t('notify.digestsDesc')} footer={<SaveButton {...save} />}>
      <div className="flex flex-col gap-3">
        <Switch checked={value.digestWeekly.enabled} onChange={(v) => onChange({ ...value, digestWeekly: { ...value.digestWeekly, enabled: v } })} label={t('notify.digestWeekly')} description={t('notify.digestWeeklyHint')} />
        {value.digestWeekly.enabled && (
          <Select
            label={t('notify.weekday')}
            className="sm:w-60"
            value={String(value.digestWeekly.weekday)}
            onChange={(v) => onChange({ ...value, digestWeekly: { ...value.digestWeekly, weekday: Number(v) } })}
            options={days.map((d, i) => ({ value: String(i + 1), label: d }))}
          />
        )}
      </div>
      <div className="flex flex-col gap-3">
        <Switch checked={value.digestMonthly.enabled} onChange={(v) => onChange({ ...value, digestMonthly: { ...value.digestMonthly, enabled: v } })} label={t('notify.digestMonthly')} description={t('notify.digestMonthlyHint')} />
        {value.digestMonthly.enabled && (
          <div className="flex flex-col gap-1.5">
            <Select
              label={t('notify.monthDay')}
              className="sm:w-60"
              value={String(value.digestMonthly.day)}
              onChange={(v) => onChange({ ...value, digestMonthly: { ...value.digestMonthly, day: Number(v) } })}
              options={Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
            />
            <p className="text-xs text-text-3">{t('notify.monthDayHint')}</p>
          </div>
        )}
      </div>
    </Section>
  );
}

export function AlertsCard({ value, onChange, base, ...save }: Props & { base: string }) {
  const { locale } = useLocale();
  const budget = value.budget.amountMinor;
  const [budgetText, setBudgetText] = useState(budget === null ? '' : formatAmountInput(budget, locale, base));
  useEffect(() => setBudgetText(budget === null ? '' : formatAmountInput(budget, locale, base)), [budget, locale, base]);
  const budgetInvalid = value.budget.enabled && budgetText.trim() !== '' && parseAmount(budgetText, locale, base) === null;
  return (
    <Section id="alerts" title={t('notify.alerts')} description={t('notify.alertsDesc')} footer={<SaveButton {...save} />}>
      <div className="flex flex-col gap-3">
        <Switch checked={value.trial.enabled} onChange={(v) => onChange({ ...value, trial: { ...value.trial, enabled: v } })} label={t('notify.trial')} description={t('notify.trialHint')} />
        {value.trial.enabled && (
          <Input
            label={t('notify.trialDays')}
            type="number"
            min={0}
            max={60}
            className="w-28"
            value={String(value.trial.days)}
            onChange={(e) => onChange({ ...value, trial: { ...value.trial, days: Math.max(0, Math.min(60, Math.round(Number(e.target.value) || 0))) } })}
          />
        )}
      </div>
      <div className="flex flex-col gap-3">
        <Switch checked={value.budget.enabled} onChange={(v) => onChange({ ...value, budget: { ...value.budget, enabled: v } })} label={t('notify.budget')} description={t('notify.budgetHint')} />
        {value.budget.enabled && (
          <Input
            label={t('notify.budgetAmount', { currency: base })}
            inputMode="decimal"
            className="sm:w-60"
            value={budgetText}
            placeholder={formatAmountInput(2000 * 10 ** minorDigits(base), locale, base)}
            error={budgetInvalid ? t('form.amountInvalid') : undefined}
            onChange={(e) => {
              setBudgetText(e.target.value);
              const minor = parseAmount(e.target.value, locale, base);
              if (e.target.value.trim() === '') onChange({ ...value, budget: { ...value.budget, amountMinor: null } });
              else if (minor !== null) onChange({ ...value, budget: { ...value.budget, amountMinor: minor } });
            }}
          />
        )}
      </div>
      <Switch checked={value.priceChange} onChange={(v) => onChange({ ...value, priceChange: v })} label={t('notify.priceChange')} description={t('notify.priceChangeHint')} />
    </Section>
  );
}
