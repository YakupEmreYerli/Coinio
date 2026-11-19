import { Check, MoreHorizontal, Pause, Pencil, RefreshCw, SkipForward, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { Logo } from '../../components/Logo';
import { Money } from '../../components/Money';
import { PayDialog, type PayTarget } from '../../components/PayDialog';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../components/ui/DropdownMenu';
import { Select } from '../../components/ui/Select';
import { t, useLocale } from '../../i18n';
import { useSubscriptionForm } from '../../layout/subscriptionForm';
import { useAppearanceValue } from '../../lib/appearanceContext';
import { cn } from '../../lib/cn';
import { relativeDue, shortDate } from '../../lib/dates';
import { useDeleteSubscription, usePay, useSkip, useUpdateSubscription } from '../../lib/hooks';
import { useDashboardData, type DueRowItem } from '../useDueItems';

type Mode = 'all' | 'manual' | 'auto' | 'foreign';

export function UpcomingCard() {
  const { locale } = useLocale();
  const { due, summary, base } = useDashboardData();
  const showForeign = useAppearanceValue().showForeign;
  const form = useSubscriptionForm();
  const pay = usePay();
  const skip = useSkip();
  const update = useUpdateSubscription();
  const del = useDeleteSubscription();
  const [mode, setMode] = useState<Mode>('all');
  const [category, setCategory] = useState('');
  const [days, setDays] = useState('30');
  const [payTarget, setPayTarget] = useState<PayTarget | null>(null);
  const [toDelete, setToDelete] = useState<DueRowItem | null>(null);

  const categories = useMemo(() => [...new Set(due.map((d) => d.sub?.category).filter(Boolean))] as string[], [due]);
  const rows = due.filter(
    (d) =>
      (d.overdue || d.daysLeft <= Number(days)) &&
      (mode === 'all' || (mode === 'manual' && !d.autoPay) || (mode === 'auto' && d.autoPay) || (mode === 'foreign' && d.currency !== base)) &&
      (!category || d.sub?.category === category),
  );

  const markPaid = (d: DueRowItem) => {
    if (d.variableAmount || d.currency !== base) setPayTarget({ subscriptionId: d.subscriptionId, name: d.name, dueDate: d.dueDate, amountMinor: d.amountMinor, currency: d.currency, base });
    else pay.mutate({ id: d.subscriptionId, name: d.name, dueDate: d.dueDate });
  };

  const pills: [Mode, string][] = [
    ['all', t('upcoming.all')],
    ['manual', t('upcoming.manual')],
    ['auto', t('upcoming.auto')],
    ['foreign', t('upcoming.foreign')],
  ];

  return (
    <Card>
      <CardHeader title={t('upcoming.title')} />
      <div className="flex flex-wrap items-center gap-1.5 px-5 pb-3.5">
        {pills.map(([m, label]) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={cn('h-[30px] rounded-[8px] border px-2.5 text-[13px]', mode === m ? 'border-primary bg-primary text-primary-fg' : 'border-line-2 bg-card text-text-2 hover:text-text')}
          >
            {label}
          </button>
        ))}
        {categories.length > 0 && (
          <Select
            aria-label={t('form.category')}
            className="h-[30px] w-auto min-w-[120px] text-[13px]"
            value={category || '*'}
            onChange={(v) => setCategory(v === '*' ? '' : v)}
            options={[{ value: '*', label: t('upcoming.allCategories') }, ...categories.map((c) => ({ value: c, label: c }))]}
          />
        )}
        <Select
          aria-label={t('upcoming.window')}
          className="h-[30px] w-auto text-[13px]"
          value={days}
          onChange={setDays}
          options={['7', '30', '60'].map((n) => ({ value: n, label: t('upcoming.days', { n }) }))}
        />
      </div>
      {summary && rows.length === 0 ? (
        <EmptyState title={t('empty.noUpcoming')} body={due.length ? t('empty.noUpcomingFiltered') : undefined} />
      ) : (
        <ul aria-label={t('upcoming.title')} className="border-t border-line">
          {rows.map((d) => {
            const foreign = d.currency !== base;
            const subLike = d.sub ?? { name: d.name, logoPath: d.logoPath };
            return (
              <li
                key={`${d.subscriptionId}-${d.dueDate}`}
                className={cn(
                  'grid min-h-[var(--row)] grid-cols-[var(--logo)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-b border-line px-4 py-2.5 last:border-b-0 md:grid-cols-[92px_minmax(0,1fr)_150px_150px_28px] md:gap-3.5 md:px-5',
                  d.overdue && 'shadow-[inset_3px_0_0_var(--neg)]',
                )}
              >
                <div className="col-start-2 row-start-2 flex gap-1.5 text-[12.5px] md:col-start-1 md:row-start-1 md:block">
                  <b className="font-normal text-text-3 md:block md:text-sm md:font-medium md:text-text">{shortDate(d.dueDate, locale)}</b>
                  <span className={cn('text-text-3', d.overdue && 'font-medium text-neg', !d.overdue && d.daysLeft <= 3 && 'text-warn')}>{relativeDue(d.daysLeft)}</span>
                </div>
                <div className="row-span-2 md:hidden">
                  <Logo sub={subLike} />
                </div>
                <div className="col-start-2 row-start-1 flex min-w-0 items-center gap-3.5 md:col-start-2">
                  <span className="hidden md:block">
                    <Logo sub={subLike} />
                  </span>
                  <div className="min-w-0">
                    <b className="block truncate text-[15px] font-medium">{d.name}</b>
                    <span className="hidden text-[12.5px] text-text-3 md:block">
                      {d.sub?.category && <span className="mr-1 rounded-[6px] bg-sunk px-1.5 py-px text-xs text-text-2">{d.sub.category}</span>}
                      {d.sub?.paymentMethod}
                    </span>
                  </div>
                </div>
                <div className="col-start-3 row-start-1 text-right md:col-start-3">
                  {d.baseMinor === null ? (
                    <>
                      <Money minor={d.amountMinor} currency={d.currency} size="lg" />
                      <span className="block text-xs text-warn">{t('upcoming.noRate')}</span>
                    </>
                  ) : (
                    <>
                      <Money minor={d.baseMinor} currency={base} size="lg" approx={foreign || d.variableAmount} className="font-medium" />
                      {foreign && showForeign && <Money minor={d.amountMinor} currency={d.currency} size="sm" cents="inline" className="block text-text-3 max-md:hidden" />}
                    </>
                  )}
                </div>
                <div className="col-start-3 row-start-2 flex justify-end md:col-start-4 md:row-start-1">
                  {d.autoPay && !d.overdue ? (
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-text-3">
                      <RefreshCw className="size-3.5" />
                      <span className="max-md:hidden">{t('upcoming.autoLabel')}</span>
                    </span>
                  ) : (
                    <Button size="sm" variant={d.overdue ? 'primary' : 'secondary'} onClick={() => markPaid(d)}>
                      <Check />
                      {t('upcoming.paid')}
                    </Button>
                  )}
                </div>
                <div className="hidden md:block">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={t('upcoming.more', { name: d.name })}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => markPaid(d)}>
                        <Check />
                        {t('upcoming.markPaid')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => skip.mutate({ id: d.subscriptionId, name: d.name, dueDate: d.dueDate })}>
                        <SkipForward />
                        {t('upcoming.skip')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => form.openEdit(d.subscriptionId)}>
                        <Pencil />
                        {t('upcoming.edit')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => update.mutate({ id: d.subscriptionId, patch: { active: false } })}>
                        <Pause />
                        {t('upcoming.pause')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem danger onSelect={() => setToDelete(d)}>
                        <Trash2 />
                        {t('common.delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <PayDialog
        target={payTarget}
        onClose={() => setPayTarget(null)}
        onPay={(v) => {
          if (payTarget) pay.mutate({ id: payTarget.subscriptionId, name: payTarget.name, dueDate: payTarget.dueDate, ...v });
          setPayTarget(null);
        }}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => !v && setToDelete(null)}
        title={t('confirm.deleteTitle', { name: toDelete?.name ?? '' })}
        body={t('confirm.deleteBody')}
        confirmLabel={t('common.delete')}
        onConfirm={() => toDelete && del.mutate(toDelete.subscriptionId)}
      />
    </Card>
  );
}
