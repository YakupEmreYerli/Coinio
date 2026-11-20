import { Check, SkipForward, Undo2 } from 'lucide-react';
import { Logo } from '../components/Logo';
import { Money } from '../components/Money';
import { Button } from '../components/ui/Button';
import { t } from '../i18n';
import { cn } from '../lib/cn';
import { usePay, useSkip, useUndoPayment } from '../lib/hooks';
import type { ApiSubscription } from '../lib/types';
import type { DayItem, DayState } from './projection';

const stateStyle: Record<DayState, string> = {
  paid: 'bg-pos/12 text-pos',
  skipped: 'bg-sunk text-text-3',
  overdue: 'bg-neg-soft text-neg',
  due: 'bg-accent-soft text-accent',
  projected: 'bg-sunk text-text-2',
};

const chip = 'inline-flex items-center rounded-full px-2 py-px text-[11.5px] font-medium';

/** One day's payments with their actions: pay or skip an open date, undo a recorded one. */
export function DayPanel({ items, subs, base }: { items: DayItem[]; subs: Map<number, ApiSubscription>; base: string }) {
  const pay = usePay();
  const skip = useSkip();
  const undo = useUndoPayment();

  if (items.length === 0) return <p className="px-5 py-10 text-center text-[13px] text-text-3">{t('calendar.dayEmpty')}</p>;

  return (
    <ul className="divide-y divide-line">
      {items.map((it) => {
        const s = subs.get(it.subscriptionId);
        if (!s) return null;
        const open = it.state === 'due' || it.state === 'overdue';
        const foreign = s.currency !== base;
        return (
          <li key={`${it.subscriptionId}-${it.dueDate}`} className="flex flex-wrap items-center gap-x-3 gap-y-2.5 px-4 py-3.5">
            <Logo sub={s} size={34} className={cn(it.state === 'skipped' && 'opacity-60')} />
            <div className="min-w-0 flex-1">
              <p className={cn('truncate text-[14.5px] font-medium', it.state === 'skipped' && 'text-text-3 line-through')}>{s.name}</p>
              <p className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className={cn(chip, stateStyle[it.state])}>{t(`calendar.state.${it.state}`)}</span>
                {s.autoPay && it.state !== 'paid' && it.state !== 'skipped' && (
                  <span className={cn(chip, 'border border-line text-text-3')} title={t('calendar.auto')}>
                    {t('calendar.autoShort')}
                  </span>
                )}
              </p>
            </div>
            <div className="text-right">
              {it.state === 'skipped' ? (
                <span className="text-[13px] text-text-3">—</span>
              ) : it.baseMinor === null ? (
                <Money minor={s.amountMinor} currency={s.currency} className="font-medium" />
              ) : (
                <Money minor={it.baseMinor} currency={base} approx={foreign && it.state !== 'paid'} className="font-medium" />
              )}
              {it.baseMinor !== null && foreign && it.state !== 'skipped' && (
                <p className="text-[11.5px] text-text-3">
                  <Money minor={s.amountMinor} currency={s.currency} size="sm" cents="inline" className="text-[11.5px]" />
                </p>
              )}
              {it.baseMinor === null && <p className="text-[11.5px] text-warn">{t('calendar.noRate')}</p>}
            </div>
            {open && (
              <div className="flex w-full justify-end gap-1.5 pl-[46px]">
                <Button size="sm" variant="ghost" onClick={() => skip.mutate({ id: s.id, name: s.name, dueDate: it.dueDate })}>
                  <SkipForward />
                  {t('calendar.skip')}
                </Button>
                <Button size="sm" variant="primary" onClick={() => pay.mutate({ id: s.id, name: s.name, dueDate: it.dueDate })}>
                  <Check />
                  {t('calendar.pay')}
                </Button>
              </div>
            )}
            {it.paymentId !== undefined && (
              <div className="flex w-full justify-end pl-[46px]">
                <Button size="sm" variant="ghost" onClick={() => undo.mutate(it.paymentId!)}>
                  <Undo2 />
                  {t('common.undo')}
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
