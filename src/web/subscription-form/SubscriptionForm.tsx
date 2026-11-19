import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { api } from '../api';
import { LogoPicker, type LogoChoice } from '../components/logo-picker/LogoPicker';
import { Button } from '../components/ui/Button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { Select } from '../components/ui/Select';
import { Switch } from '../components/ui/Switch';
import { Textarea } from '../components/ui/Textarea';
import { toast } from '../components/ui/Toaster';
import { t, useLocale } from '../i18n';
import type { SubscriptionPrefill } from '../layout/subscriptionForm';
import { useSettings, useSubscription, useSubscriptions } from '../lib/hooks';
import type { ApiSubscription, Cycle } from '../lib/types';
import { formatAmountInput, parseAmount } from './amount';
import { CatalogSuggestions } from './CatalogSuggestions';

type Values = {
  name: string;
  domain: string;
  amount: string;
  currency: string;
  intervalCount: string;
  cycle: Cycle;
  nextDue: string;
  autoPay: boolean;
  variableAmount: boolean;
  paymentMethod: string;
  category: string;
  reminderDays: string;
  notes: string;
  active: boolean;
};

const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP', 'CHF', 'CAD', 'AUD'];

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toValues(s: ApiSubscription | null, prefill: SubscriptionPrefill | undefined, base: string, locale: 'en' | 'tr'): Values {
  return {
    name: s?.name ?? prefill?.name ?? '',
    domain: s?.domain ?? prefill?.domain ?? '',
    amount: s ? formatAmountInput(s.amountMinor, locale) : prefill?.amountMinor !== undefined ? formatAmountInput(prefill.amountMinor, locale) : '',
    currency: s?.currency ?? base,
    intervalCount: String(s?.intervalCount ?? 1),
    cycle: s?.cycle ?? prefill?.cycle ?? 'monthly',
    nextDue: s?.nextDue ?? localToday(),
    autoPay: s?.autoPay ?? true,
    variableAmount: s?.variableAmount ?? false,
    paymentMethod: s?.paymentMethod ?? '',
    category: s?.category ?? prefill?.category ?? '',
    reminderDays: String(s?.reminderDays ?? 1),
    notes: s?.notes ?? '',
    active: s?.active ?? true,
  };
}

/** Add / edit dialog. Saves the subscription first, then applies the chosen logo. */
export function SubscriptionForm({
  open,
  onOpenChange,
  editId,
  prefill,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editId?: number;
  prefill?: SubscriptionPrefill;
  onDelete?: (s: ApiSubscription) => void;
}) {
  const { locale } = useLocale();
  const qc = useQueryClient();
  const base = useSettings().data?.baseCurrency ?? 'USD';
  const existing = useSubscription(editId ?? 0);
  const editing = editId !== undefined;
  const sub = editing ? (existing.data ?? null) : null;
  const all = useSubscriptions().data ?? [];
  const [logo, setLogo] = useState<LogoChoice>({ kind: 'keep' });
  const [saving, setSaving] = useState(false);
  const [picked, setPicked] = useState(false);
  const form = useForm<Values>({ defaultValues: toValues(null, prefill, base, locale) });
  const { register, handleSubmit, control, reset, watch, formState } = form;

  useEffect(() => {
    if (!open) return;
    if (editing && !sub) return;
    reset(toValues(sub, prefill, base, locale));
    setLogo({ kind: 'keep' });
    setPicked(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sub?.id, sub?.updatedAt, base]);

  const methods = useMemo(() => [...new Set(all.map((s) => s.paymentMethod).filter(Boolean))] as string[], [all]);
  const categories = useMemo(() => [...new Set(all.map((s) => s.category).filter(Boolean))] as string[], [all]);
  const name = watch('name');
  const domain = watch('domain');

  const onSubmit = handleSubmit(async (v) => {
    const amountMinor = parseAmount(v.amount, locale);
    if (amountMinor === null) return form.setError('amount', { message: t('form.amountInvalid') });
    const payload = {
      name: v.name.trim(),
      domain: v.domain.trim() || null,
      amountMinor,
      currency: v.currency,
      cycle: v.cycle,
      intervalCount: Math.max(1, Math.min(36, Number(v.intervalCount) || 1)),
      nextDue: v.nextDue,
      autoPay: v.autoPay,
      variableAmount: v.variableAmount,
      paymentMethod: v.paymentMethod.trim() || null,
      category: v.category.trim() || null,
      notes: v.notes.trim() || null,
      reminderDays: Math.max(0, Math.min(30, Number(v.reminderDays) || 0)),
      ...(editing ? { active: v.active } : {}),
    };
    setSaving(true);
    try {
      const saved = editing
        ? await api.patch<ApiSubscription>(`/subscriptions/${editId}`, payload)
        : await api.post<ApiSubscription>('/subscriptions', payload);
      if (logo.kind === 'candidate') await api.post(`/subscriptions/${saved.id}/logo/select`, { candidateId: logo.candidateId, style: logo.style });
      else if (logo.kind === 'file') {
        const fd = new FormData();
        fd.append('logo', logo.file);
        await api.upload(`/subscriptions/${saved.id}/logo`, fd);
      } else if (logo.kind === 'none' && saved.logoPath) await api.del(`/subscriptions/${saved.id}/logo`);
      await qc.invalidateQueries();
      toast.success(editing ? t('form.saved') : t('form.created', { name: saved.name }));
      onOpenChange(false);
    } catch {
      toast.error(t('error.generic'));
    } finally {
      setSaving(false);
    }
  });

  const err = formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? t('form.editTitle') : t('form.addTitle')} size="md">
        <form onSubmit={onSubmit} noValidate>
          <DialogBody>
            <LogoPicker name={name} domain={domain} value={logo} onChange={setLogo} current={sub} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-4">
              <Input label={t('form.name')} {...register('name', { validate: (s) => s.trim().length > 0 || t('form.nameRequired') })} error={err.name?.message} maxLength={80} autoComplete="off" />
              <CatalogSuggestions
                query={name}
                hidden={editing || !!domain.trim() || picked}
                onPick={(s, label) => {
                  form.setValue('name', s.name);
                  form.setValue('domain', s.domain);
                  form.setValue('cycle', s.cycle);
                  if (!form.getValues('category')) form.setValue('category', label);
                  setPicked(true);
                }}
              />
              </div>
              <Input label={t('form.domain')} placeholder="netflix.com" {...register('domain')} hint={t('form.domainHint')} autoComplete="off" inputMode="url" />
            </div>
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <Input label={t('form.amount')} inputMode="decimal" placeholder={locale === 'tr' ? '99,99' : '99.99'} {...register('amount', { required: t('form.amountInvalid') })} error={err.amount?.message} />
              <Controller
                control={control}
                name="currency"
                render={({ field }) => (
                  <Select label={t('form.currency')} value={field.value} onChange={field.onChange} options={[...new Set([base, ...CURRENCIES])].map((c) => ({ value: c, label: c }))} />
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>{t('form.cycle')}</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-text-2">{t('form.every')}</span>
                  <Input aria-label={t('form.intervalCount')} type="number" min={1} max={36} className="w-[72px]" {...register('intervalCount')} />
                  <Controller
                    control={control}
                    name="cycle"
                    render={({ field }) => (
                      <Select
                        aria-label={t('form.cycle')}
                        value={field.value}
                        onChange={field.onChange}
                        options={[
                          { value: 'weekly', label: t('cycle.weeks') },
                          { value: 'monthly', label: t('cycle.months') },
                          { value: 'yearly', label: t('cycle.years') },
                        ]}
                      />
                    )}
                  />
                </div>
              </div>
              <Input label={t('form.nextDue')} type="date" {...register('nextDue', { required: t('form.dateRequired') })} error={err.nextDue?.message} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label={t('form.method')} list="st-methods" placeholder={t('form.methodPh')} {...register('paymentMethod')} maxLength={80} />
              <Input label={t('form.category')} list="st-categories" placeholder={t('form.categoryPh')} {...register('category')} maxLength={80} />
              <datalist id="st-methods">{methods.map((m) => <option key={m} value={m} />)}</datalist>
              <datalist id="st-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="flex flex-col gap-4 rounded-ctl border border-line p-4">
              <Controller control={control} name="autoPay" render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label={t('form.autoPay')} description={t('form.autoPayHint')} />} />
              <Controller control={control} name="variableAmount" render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label={t('form.variable')} description={t('form.variableHint')} />} />
              {editing && <Controller control={control} name="active" render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label={t('form.active')} description={t('form.activeHint')} />} />}
            </div>
            <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
              <Input label={t('form.reminder')} type="number" min={0} max={30} {...register('reminderDays')} hint={t('form.reminderHint')} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="st-notes">{t('form.notes')}</Label>
                <Textarea id="st-notes" rows={2} maxLength={2000} {...register('notes')} />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            {editing && sub && onDelete && (
              <Button variant="ghost" className="mr-auto text-neg hover:text-neg" onClick={() => onDelete(sub)}>
                {t('common.delete')}
              </Button>
            )}
            <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
