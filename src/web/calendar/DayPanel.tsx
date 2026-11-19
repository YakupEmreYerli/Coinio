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
  projected: 'bg-sunk text-text-3',
};

/** One day's payments with their actions: pay or skip an open date, undo a recorded one. */
export function DayPanel({ items, subs, base }: { items: DayItem[]; subs: Map<number, ApiSubscription>; base: string }) {
  const pay = usePay();
  const skip = useSkip();
  const undo = useUndoPayment();

  if (items.length === 0) return <p className="px-5 py-8 text-center text-[13px] text-text-3">{t('calendar.dayEmpty')}</p>;

  return (
    <ul className="divide-y divide-line">
      {items.map((it) => {
        const s = subs.get(it.subscriptionId);
        if (!s) return null;
        const open = it.state === 'due' || it.state === 'overdue';
        return (
          <li key={`${it.subscriptionId}-${it.dueDate}`} className="flex flex-wrap items-center gap-3 px-5 py-4">
            <Logo sub={s} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{s.name}</p>
              <p className="mt-0.5 flex items-center gap-2 text-[12.5px] text-text-3">
                <span className={cn('rounded-full px-2 py-px text-[11.5px] font-medium', stateStyle[it.state])}>{t(`calendar.state.${it.state}`)}</span>
                {s.autoPay && open && <span>{t('calendar.auto')}</span>}
              </p>
            </div>
            <div className="text-right">
              {it.state === 'skipped' ? (
                <span className="text-[13px] text-text-3">—</span>
              ) : it.baseMinor === null ? (
                <Money minor={s.amountMinor} currency={s.currency} />
              ) : (
                <Money minor={it.baseMinor} currency={base} approx={s.currency !== base && it.state !== 'paid'} />
              )}
              {it.baseMinor !== null && s.currency !== base && it.state !== 'skipped' && (
                <p className="text-[11.5px] text-text-3">
                  <Money minor={s.amountMinor} currency={s.currency} size="sm" cents="inline" />
                </p>
              )}
              {it.baseMinor === null && <p className="text-[11.5px] text-warn">{t('calendar.noRate')}</p>}
            </div>
            {open && (
              <div className="flex w-full justify-end gap-2">
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
              <div className="flex w-full justify-end">
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
