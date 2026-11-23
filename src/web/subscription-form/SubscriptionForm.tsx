import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { api } from '../api';
import { LogoPicker, type LogoChoice } from '../components/logo-picker/LogoPicker';
import { OffsetChips, offsetLabel } from '../components/OffsetChips';
import { Button } from '../components/ui/Button';
import { Checkbox } from '../components/ui/Checkbox';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { Select } from '../components/ui/Select';
import { Switch } from '../components/ui/Switch';
import { Textarea } from '../components/ui/Textarea';
import { toast } from '../components/ui/Toaster';
import { DEMO } from '../demo/flag';
import { failureText } from '../lib/failure';
import { t, useLocale, type Locale } from '../i18n';
import type { SubscriptionPrefill } from '../layout/subscriptionForm';
import { useFamily, useFirefly, useFireflyAccounts, useNotifications, useSettings, useSubscription, useSubscriptions } from '../lib/hooks';
import type { ApiSubscription, Cycle } from '../lib/types';
import { amountInputMode, formatAmountInput, parseAmount } from './amount';
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
  ownReminders: boolean;
  reminderOffsets: number[];
  trialEndsAt: string;
  notes: string;
  active: boolean;
};

const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY'];
const FF_DEFAULT = 'default';

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toValues(s: ApiSubscription | null, prefill: SubscriptionPrefill | undefined, base: string, locale: Locale): Values {
  return {
    name: s?.name ?? prefill?.name ?? '',
    domain: s?.domain ?? prefill?.domain ?? '',
    amount: s ? formatAmountInput(s.amountMinor, locale, s.currency) : prefill?.amountMinor !== undefined ? formatAmountInput(prefill.amountMinor, locale, base) : '',
    currency: s?.currency ?? base,
    intervalCount: String(s?.intervalCount ?? 1),
    cycle: s?.cycle ?? prefill?.cycle ?? 'monthly',
    nextDue: s?.nextDue ?? localToday(),
    autoPay: s?.autoPay ?? true,
    variableAmount: s?.variableAmount ?? false,
    paymentMethod: s?.paymentMethod ?? '',
    category: s?.category ?? prefill?.category ?? '',
    ownReminders: !!s?.reminderOffsets,
    reminderOffsets: s?.reminderOffsets ?? [],
    trialEndsAt: s?.trialEndsAt ?? '',
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
  const family = useFamily().data;
  const household = family?.household ?? null;
  const members = family?.members ?? [];
  const notifyDefaults = useNotifications().data?.settings?.offsets;
  const [logo, setLogo] = useState<LogoChoice>({ kind: 'keep' });
  const [saving, setSaving] = useState(false);
  const [picked, setPicked] = useState(false);
  const [shared, setShared] = useState(false);
  const [paidByMemberId, setPaidByMemberId] = useState<string>('');
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
  const [splitMemberIds, setSplitMemberIds] = useState<number[]>([]);
  const [customShares, setCustomShares] = useState<Record<number, string>>({});
  const [splitError, setSplitError] = useState<string | null>(null);
  // Only a subscription already linked to a Firefly III bill has an account of its own; `undefined` = untouched.
  const [ffAccount, setFfAccount] = useState<string>();
  const firefly = useFirefly(open && editing && !DEMO);
  const link = useQuery({
    queryKey: ['firefly', 'link', editId],
    queryFn: () => api.get<{ assetAccountId: string | null }>(`/firefly/links/${editId}`),
    enabled: open && editing && !!firefly.data?.connection,
    retry: false,
  });
  const ffAccounts = useFireflyAccounts(link.isSuccess).data?.accounts;
  const ffDefault = ffAccounts?.find((a) => a.id === firefly.data?.connection?.assetAccountId);
  const form = useForm<Values>({ defaultValues: toValues(null, prefill, base, locale) });
  const { register, handleSubmit, control, reset, watch, formState } = form;

  useEffect(() => {
    if (!open) return;
    if (editing && !sub) return;
    reset(toValues(sub, prefill, base, locale));
    setLogo({ kind: 'keep' });
    setPicked(false);
    setFfAccount(undefined);
    setSplitError(null);
    if (household) {
      const isShared = !!sub?.householdId;
      setShared(isShared);
      setPaidByMemberId(String(sub?.paidByMemberId ?? household.myMemberId));
      const hasCustom = !!sub?.splits?.some((sp) => sp.shareMinor !== null);
      setSplitMode(hasCustom ? 'custom' : 'equal');
      const ids = sub?.splits?.length ? sub.splits.map((sp) => sp.memberId) : members.map((m) => m.id);
      setSplitMemberIds(ids);
      const map: Record<number, string> = {};
      if (sub?.splits) {
        for (const sp of sub.splits) {
          map[sp.memberId] = formatAmountInput(sp.shareMinor ?? sp.effectiveMinor, locale, sub.currency);
        }
      }
      setCustomShares(map);
    } else {
      setShared(false);
      setSplitMemberIds([]);
      setCustomShares({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sub?.id, sub?.updatedAt, base, household?.id]);

  const methods = useMemo(() => [...new Set(all.map((s) => s.paymentMethod).filter(Boolean))] as string[], [all]);
  const categories = useMemo(() => [...new Set(all.map((s) => s.category).filter(Boolean))] as string[], [all]);
  const name = watch('name');
  const domain = watch('domain');
  const currency = watch('currency');
  const ownReminders = watch('ownReminders');
  const cycle = watch('cycle');
  const defaultOffsets = notifyDefaults?.[cycle];

  const onSubmit = handleSubmit(async (v) => {
    setSplitError(null);
    const amountMinor = parseAmount(v.amount, locale, v.currency);
    if (amountMinor === null) return form.setError('amount', { message: t('form.amountInvalid', { example: formatAmountInput(9999, locale, v.currency) }) });

    let familyFields: Record<string, unknown> = {};
    if (household) {
      if (!shared) {
        if (editing && sub?.householdId) familyFields = { shared: false };
      } else {
        const pickedMembers = splitMemberIds.length > 0 ? splitMemberIds : members.map((m) => m.id);
        if (pickedMembers.length === 0) {
          setSplitError(t('family.splitNoMembers'));
          return;
        }
        let splits: { memberId: number; shareMinor: number | null }[];
        if (splitMode === 'equal') {
          splits = pickedMembers.map((memberId) => ({ memberId, shareMinor: null }));
        } else {
          splits = [];
          let sum = 0;
          for (const memberId of pickedMembers) {
            const parsedShare = parseAmount(customShares[memberId] ?? '0', locale, v.currency);
            if (parsedShare === null || parsedShare < 0) {
              setSplitError(t('family.splitInvalidAmount'));
              return;
            }
            sum += parsedShare;
            splits.push({ memberId, shareMinor: parsedShare });
          }
          if (sum !== amountMinor) {
            setSplitError(t('family.splitSumMismatch'));
            return;
          }
        }
        familyFields = {
          shared: true,
          paidByMemberId: paidByMemberId ? Number(paidByMemberId) : household.myMemberId,
          splits,
        };
      }
    }

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
      reminderOffsets: v.ownReminders ? v.reminderOffsets : null,
      trialEndsAt: v.trialEndsAt || null,
      ...(editing ? { active: v.active } : {}),
      ...familyFields,
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
      if (ffAccount !== undefined) await api.put(`/firefly/links/${saved.id}`, { assetAccountId: ffAccount === FF_DEFAULT ? null : ffAccount });
      await qc.invalidateQueries();
      toast.success(editing ? t('form.saved') : t('form.created', { name: saved.name }));
      onOpenChange(false);
    } catch (e) {
      toast.error(failureText(e));
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
              <div className="relative">
              <Input label={t('form.name')} {...register('name', { validate: (s) => s.trim().length > 0 || t('form.nameRequired') })} error={err.name?.message} maxLength={80} autoComplete="off" data-1p-ignore="" data-lpignore="true" data-bwignore="" />
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
              <Input label={t('form.amount')} inputMode={amountInputMode(currency)} placeholder={formatAmountInput(9999, locale, currency)} {...register('amount', { required: t('form.amountInvalid', { example: formatAmountInput(9999, locale, currency) }) })} error={err.amount?.message} />
              <Controller
                control={control}
                name="currency"
                render={({ field }) => (
                  <Select label={t('form.currency')} value={field.value} onChange={field.onChange} options={[...new Set([base, field.value, ...CURRENCIES])].map((c) => ({ value: c, label: c }))} />
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
            {link.isSuccess && ffAccounts && (
              <div className="flex flex-col gap-1.5">
                <Select
                  label={t('form.firefly')}
                  value={ffAccount ?? link.data.assetAccountId ?? FF_DEFAULT}
                  onChange={setFfAccount}
                  options={[
                    {
                      value: FF_DEFAULT,
                      label: ffDefault ? `${t('form.fireflyDefault')} — ${ffDefault.name} (${ffDefault.currencyCode})` : t('form.fireflyDefault'),
                    },
                    ...ffAccounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currencyCode})` })),
                  ]}
                />
                <p className="text-xs text-text-3">{t('form.fireflyHint')}</p>
              </div>
            )}
            <div className="flex flex-col gap-4 rounded-ctl border border-line p-4">
              <Controller control={control} name="autoPay" render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label={t('form.autoPay')} description={t('form.autoPayHint')} />} />
              <Controller control={control} name="variableAmount" render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label={t('form.variable')} description={t('form.variableHint')} />} />
              {editing && <Controller control={control} name="active" render={({ field }) => <Switch checked={field.value} onChange={field.onChange} label={t('form.active')} description={t('form.activeHint')} />} />}
            </div>
            <div className="flex flex-col gap-4 rounded-ctl border border-line p-4">
              <Controller
                control={control}
                name="ownReminders"
                render={({ field }) => (
                  <Switch
                    checked={!field.value}
                    onChange={(useDefault) => {
                      field.onChange(!useDefault);
                      if (!useDefault && form.getValues('reminderOffsets').length === 0) form.setValue('reminderOffsets', defaultOffsets ?? [1]);
                    }}
                    label={t('form.reminderDefault')}
                    description={
                      defaultOffsets ? (defaultOffsets.length ? defaultOffsets.map(offsetLabel).join(', ') : t('notify.noOffsets')) : t('form.reminderHint')
                    }
                  />
                )}
              />
              {ownReminders && (
                <Controller control={control} name="reminderOffsets" render={({ field }) => <OffsetChips label={t('form.reminder')} value={field.value} onChange={field.onChange} />} />
              )}
              <Input label={t('form.trialEnds')} type="date" {...register('trialEndsAt')} hint={t('form.trialEndsHint')} className="sm:w-52" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="st-notes">{t('form.notes')}</Label>
              <Textarea id="st-notes" rows={2} maxLength={2000} {...register('notes')} />
            </div>
            {household && (
              <div className="flex flex-col gap-3 rounded-ctl border border-line p-4">
                <Switch
                  checked={shared}
                  onChange={(on) => {
                    setShared(on);
                    setSplitError(null);
                    if (on && splitMemberIds.length === 0) setSplitMemberIds(members.map((m) => m.id));
                  }}
                  label={t('family.sharedToggle')}
                  description={t('family.sharedToggleHint')}
                />
                {shared && (
                  <>
                    <Select
                      label={t('family.paidBy')}
                      value={paidByMemberId || String(household.myMemberId)}
                      onChange={setPaidByMemberId}
                      options={members.map((m) => ({ value: String(m.id), label: m.name }))}
                    />
                    <Select
                      label={t('family.splitMode')}
                      value={splitMode}
                      onChange={(v) => {
                        setSplitMode(v as 'equal' | 'custom');
                        setSplitError(null);
                      }}
                      options={[
                        { value: 'equal', label: t('family.splitEqual') },
                        { value: 'custom', label: t('family.splitCustom') },
                      ]}
                    />
                    <div className="flex flex-col gap-2">
                      <Label>{t('family.splitAmong')}</Label>
                      <div className="flex flex-col gap-2">
                        {members.map((m) => {
                          const checked = splitMemberIds.includes(m.id);
                          return (
                            <div key={m.id} className="flex items-center justify-between gap-2">
                              <label className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  aria-label={m.name}
                                  checked={checked}
                                  onChange={(on) =>
                                    setSplitMemberIds((cur) => (on ? [...new Set([...cur, m.id])] : cur.filter((id) => id !== m.id)))
                                  }
                                />
                                <span>{m.name}</span>
                              </label>
                              {splitMode === 'custom' && checked && (
                                <input
                                  aria-label={t('family.shareFor', { name: m.name })}
                                  inputMode={amountInputMode(currency)}
                                  placeholder={formatAmountInput(0, locale, currency)}
                                  value={customShares[m.id] ?? ''}
                                  onChange={(e) => setCustomShares((cur) => ({ ...cur, [m.id]: e.target.value }))}
                                  className="h-8 w-28 rounded-[8px] border border-line-2 bg-card px-2 text-right text-sm outline-none focus:border-accent"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {splitError && <p className="text-xs text-neg">{splitError}</p>}
                    </div>
                  </>
                )}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            {editing && sub && onDelete && sub.canEdit !== false && (
              <Button variant="ghost" className="mr-auto text-neg hover:text-neg" onClick={() => onDelete(sub)}>
                {t('common.delete')}
              </Button>
            )}
            <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" variant="primary" disabled={saving || (editing && sub?.canEdit === false)}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
