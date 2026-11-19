import { Pause, Plus, Search, Tag, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { Logo } from '../components/Logo';
import { Money } from '../components/Money';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Checkbox } from '../components/ui/Checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/Popover';
import { Select } from '../components/ui/Select';
import { t, useLocale } from '../i18n';
import { useSubscriptionForm } from '../layout/subscriptionForm';
import { cn } from '../lib/cn';
import { cycleLabel } from '../lib/cycle';
import { shortDate } from '../lib/dates';
import { useDeleteSubscription, useSettings, useSubscriptions, useSummary, useUpdateSubscription } from '../lib/hooks';
import { monthlyCost } from '../lib/money';
import { SubscriptionDetail } from '../subscriptions/SubscriptionDetail';

const ALL = '*';

export function Subscriptions() {
  const { locale } = useLocale();
  const navigate = useNavigate();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const form = useSubscriptionForm();
  const subs = useSubscriptions();
  const summary = useSummary().data;
  const settings = useSettings().data;
  const base = summary?.base ?? settings?.baseCurrency ?? 'USD';
  const update = useUpdateSubscription();
  const del = useDeleteSubscription();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  const q = params.get('q') ?? '';
  const category = params.get('category') ?? ALL;
  const method = params.get('method') ?? ALL;
  const mode = params.get('mode') ?? ALL;
  const status = params.get('status') ?? ALL;
  const sort = params.get('sort') ?? 'name';
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (!v || v === ALL) next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  };

  const all = subs.data ?? [];
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a!.localeCompare(b!, locale)) as string[];
  const categories = uniq(all.map((s) => s.category));
  const methods = uniq(all.map((s) => s.paymentMethod));
  const needle = q.toLocaleLowerCase('tr');
  const rows = useMemo(
    () =>
      all
        .filter(
          (s) =>
            (!needle || `${s.name} ${s.domain ?? ''} ${s.category ?? ''}`.toLocaleLowerCase('tr').includes(needle)) &&
            (category === ALL || s.category === category) &&
            (method === ALL || s.paymentMethod === method) &&
            (mode === ALL || (mode === 'auto') === s.autoPay) &&
            (status === ALL || (status === 'active') === s.active),
        )
        .map((s) => ({ s, monthly: monthlyCost(s, base, summary?.rates) }))
        .sort((a, b) =>
          sort === 'cost' ? (b.monthly ?? -1) - (a.monthly ?? -1) : sort === 'next' ? a.s.nextDue.localeCompare(b.s.nextDue) : a.s.name.localeCompare(b.s.name, locale),
        ),
    [all, needle, category, method, mode, status, sort, base, summary?.rates, locale],
  );
  const toggle = (sid: number, on: boolean) =>
    setSelected((cur) => {
      const n = new Set(cur);
      if (on) n.add(sid);
      else n.delete(sid);
      return n;
    });
  const bulk = async (patch: Record<string, unknown>) => {
    for (const sid of selected) await update.mutateAsync({ id: sid, patch });
    setSelected(new Set());
  };
  const detail = id ? all.find((s) => s.id === Number(id)) : undefined;

  return (
    <div className="flex flex-col gap-5 px-4 pt-2 pb-12 md:px-9">
      <div className="flex items-end gap-3">
        <div>
          <h1 className="font-display text-[26px] leading-tight md:text-[30px]">{t('nav.subscriptions')}</h1>
          <p className="mt-0.5 text-text-2">{t('subs.count', { n: all.filter((s) => s.active).length, paused: all.filter((s) => !s.active).length })}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-ctl border border-line-2 bg-card px-3 focus-within:border-accent md:max-w-[340px]">
          <Search className="size-4 text-text-3" />
          <input type="search" value={q} onChange={(e) => setParam('q', e.target.value)} placeholder={t('subs.search')} className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-3" />
        </label>
        {categories.length > 0 && (
          <Select aria-label={t('form.category')} className="w-auto" value={category} onChange={(v) => setParam('category', v)} options={[{ value: ALL, label: t('upcoming.allCategories') }, ...categories.map((c) => ({ value: c, label: c }))]} />
        )}
        {methods.length > 0 && (
          <Select aria-label={t('form.method')} className="w-auto" value={method} onChange={(v) => setParam('method', v)} options={[{ value: ALL, label: t('subs.allMethods') }, ...methods.map((m) => ({ value: m, label: m }))]} />
        )}
        <Select
          aria-label={t('subs.mode')}
          className="w-auto"
          value={mode}
          onChange={(v) => setParam('mode', v)}
          options={[
            { value: ALL, label: t('subs.anyMode') },
            { value: 'auto', label: t('upcoming.auto') },
            { value: 'manual', label: t('upcoming.manual') },
          ]}
        />
        <Select
          aria-label={t('subs.status')}
          className="w-auto"
          value={status}
          onChange={(v) => setParam('status', v)}
          options={[
            { value: ALL, label: t('subs.anyStatus') },
            { value: 'active', label: t('subs.active') },
            { value: 'paused', label: t('subs.paused') },
          ]}
        />
        <Select
          aria-label={t('all.sort')}
          className="w-auto md:ml-auto"
          value={sort}
          onChange={(v) => setParam('sort', v)}
          options={[
            { value: 'name', label: t('all.byName') },
            { value: 'cost', label: t('all.byCost') },
            { value: 'next', label: t('all.byNext') },
          ]}
        />
      </div>

      {selected.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-card bg-primary px-4 py-2.5 text-primary-fg shadow-[var(--shadow)]">
          <span className="text-sm font-medium">{t('subs.selected', { n: selected.size })}</span>
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="ghost" className="text-primary-fg hover:bg-white/10 hover:text-primary-fg">
                  <Tag />
                  {t('subs.setCategory')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="flex w-64 gap-2">
                <input list="bulk-cats" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder={t('form.categoryPh')} className="h-9 min-w-0 flex-1 rounded-[8px] border border-line-2 bg-card px-2.5 text-sm outline-none" />
                <datalist id="bulk-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
                <Button size="sm" variant="primary" onClick={() => void bulk({ category: newCategory.trim() || null })}>
                  {t('common.save')}
                </Button>
              </PopoverContent>
            </Popover>
            <Button size="sm" variant="ghost" className="text-primary-fg hover:bg-white/10 hover:text-primary-fg" onClick={() => void bulk({ active: false })}>
              <Pause />
              {t('upcoming.pause')}
            </Button>
            <Button size="sm" variant="ghost" className="text-primary-fg hover:bg-white/10 hover:text-primary-fg" onClick={() => setConfirmBulk(true)}>
              <Trash2 />
              {t('common.delete')}
            </Button>
            <Button size="icon-sm" variant="ghost" className="text-primary-fg hover:bg-white/10 hover:text-primary-fg" aria-label={t('subs.clearSelection')} onClick={() => setSelected(new Set())}>
              <X />
            </Button>
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        {subs.data && all.length === 0 ? (
          <EmptyState title={t('empty.noSubs')} body={t('empty.noSubsBody')} action={<Button variant="primary" onClick={() => form.openCreate()}><Plus />{t('top.add')}</Button>} />
        ) : subs.data && rows.length === 0 ? (
          <EmptyState icon={<Search />} title={t('subs.noMatch')} body={t('empty.noUpcomingFiltered')} />
        ) : (
          <>
            <div className="hidden h-9 grid-cols-[40px_minmax(0,1.6fr)_1fr_1fr_110px_150px] items-center gap-3 border-b border-line bg-sunk px-5 text-[12.5px] text-text-3 md:grid">
              <Checkbox
                aria-label={t('subs.selectAll')}
                checked={rows.length > 0 && rows.every((r) => selected.has(r.s.id)) ? true : selected.size ? 'indeterminate' : false}
                onChange={(on) => setSelected(on ? new Set(rows.map((r) => r.s.id)) : new Set())}
              />
              <span>{t('form.name')}</span>
              <span>{t('form.category')}</span>
              <span>{t('form.cycle')}</span>
              <span>{t('form.nextDue')}</span>
              <span className="text-right">{t('subs.monthlyCost')}</span>
            </div>
            <ul>
              {rows.map(({ s, monthly }) => (
                <li
                  key={s.id}
                  data-testid="sub-row"
                  className={cn(
                    'grid cursor-pointer grid-cols-[28px_var(--logo)_minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 hover:bg-[color-mix(in_oklab,var(--sunk)_55%,transparent)] md:grid-cols-[40px_minmax(0,1.6fr)_1fr_1fr_110px_150px] md:px-5',
                    !s.active && 'opacity-60',
                  )}
                  onClick={() => navigate(`/subscriptions/${s.id}${location.search}`)}
                >
                  <span onClick={(e) => e.stopPropagation()} className="flex">
                    <Checkbox aria-label={t('subs.select', { name: s.name })} checked={selected.has(s.id)} onChange={(on) => toggle(s.id, on)} />
                  </span>
                  <span className="md:hidden">
                    <Logo sub={s} />
                  </span>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="hidden md:block">
                      <Logo sub={s} />
                    </span>
                    <div className="min-w-0">
                      <b data-testid="sub-name" className="block truncate text-[15px] font-medium">
                        {s.name}
                      </b>
                      <span className="block truncate text-[12.5px] text-text-3">
                        {[s.paymentMethod, s.autoPay ? t('upcoming.auto') : t('all.manual'), !s.active && t('subs.paused')].filter(Boolean).join(' · ')}
                        <span className="md:hidden"> · {shortDate(s.nextDue, locale)}</span>
                      </span>
                    </div>
                  </div>
                  <span className="hidden truncate text-sm text-text-2 md:block">{s.category ?? '—'}</span>
                  <span className="hidden text-sm text-text-2 md:block">{cycleLabel(s)}</span>
                  <span className="hidden text-sm md:block">{s.active ? shortDate(s.nextDue, locale) : '—'}</span>
                  <span className="text-right">
                    {monthly === null ? <Money minor={s.amountMinor} currency={s.currency} size="md" /> : <Money minor={monthly} currency={base} size="md" approx={s.currency !== base} className="font-medium" />}
                    {s.currency !== base && <Money minor={s.amountMinor} currency={s.currency} size="sm" cents="inline" className="block text-text-3 max-md:hidden" />}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <SubscriptionDetail sub={detail} base={base} onClose={() => navigate(`/subscriptions${location.search}`)} />
      <ConfirmDialog
        open={confirmBulk}
        onOpenChange={setConfirmBulk}
        title={t('subs.bulkDeleteTitle', { n: selected.size })}
        body={t('confirm.deleteBody')}
        confirmLabel={t('common.delete')}
        onConfirm={async () => {
          for (const sid of selected) await del.mutateAsync(sid);
          setSelected(new Set());
        }}
      />
    </div>
  );
}
