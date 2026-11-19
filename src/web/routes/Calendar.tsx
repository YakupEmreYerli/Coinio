import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { todayIn } from '../../shared/schedule';
import { DayPanel } from '../calendar/DayPanel';
import { daysIn, fmt, isMonth, shiftMonth } from '../calendar/dates';
import { MonthGrid, dayTotal } from '../calendar/MonthGrid';
import { projectMonth } from '../calendar/projection';
import { EmptyState } from '../components/EmptyState';
import { Logo } from '../components/Logo';
import { Money } from '../components/Money';
import { Button } from '../components/ui/Button';
import { Sheet, SheetContent } from '../components/ui/Sheet';
import { t, useLocale } from '../i18n';
import { cn } from '../lib/cn';
import { usePayments, useSettings, useSubscriptions, useSummary } from '../lib/hooks';
import { useIsMobile } from '../lib/useMediaQuery';
import { useSubscriptionForm } from '../layout/subscriptionForm';

export function Calendar() {
  const { locale } = useLocale();
  const mobile = useIsMobile();
  const form = useSubscriptionForm();
  const [params, setParams] = useSearchParams();
  const settings = useSettings().data;
  const summary = useSummary().data;
  const subsQuery = useSubscriptions();

  const today = todayIn(settings?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone, new Date());
  const month = isMonth(params.get('month')) ? params.get('month')! : today.slice(0, 7);
  const payments = usePayments({ from: `${month}-01`, to: `${month}-${daysIn(month)}` }).data;
  const [selected, setSelected] = useState<string | null>(null);

  const subs = useMemo(() => new Map((subsQuery.data ?? []).map((s) => [s.id, s])), [subsQuery.data]);
  const base = summary?.base ?? settings?.baseCurrency ?? 'TRY';
  const days = useMemo(
    () => projectMonth(subsQuery.data ?? [], payments ?? [], month, today, { base, rates: summary?.rates ?? {} }),
    [subsQuery.data, payments, month, today, base, summary?.rates],
  );
  const total = Object.values(days).reduce((s, items) => s + dayTotal(items), 0);
  const go = (m: string) => setParams(m === today.slice(0, 7) ? {} : { month: m });

  const noSubs = subsQuery.isSuccess && subsQuery.data.length === 0;

  return (
    <div className="px-4 pb-12 md:px-9">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 pt-2 pb-5">
        <div className="min-w-0">
          <p className="text-[13px] text-text-3">{t('nav.calendar')}</p>
          <h1 className="font-display text-[30px] leading-tight first-letter:uppercase">{fmt(`${month}-01`, locale, { month: 'long', year: 'numeric' })}</h1>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {month !== today.slice(0, 7) && (
            <Button size="sm" variant="secondary" onClick={() => go(today.slice(0, 7))}>
              {t('calendar.today')}
            </Button>
          )}
          <Button size="icon-sm" variant="secondary" aria-label={t('calendar.prev')} onClick={() => go(shiftMonth(month, -1))}>
            <ChevronLeft />
          </Button>
          <Button size="icon-sm" variant="secondary" aria-label={t('calendar.next')} onClick={() => go(shiftMonth(month, 1))}>
            <ChevronRight />
          </Button>
        </div>
        <div className="w-full text-[13px] text-text-3 sm:w-auto sm:basis-full">
          {t('calendar.total')} <Money minor={total} currency={base} size="sm" className="text-text" />
        </div>
      </div>

      {noSubs ? (
        <EmptyState
          icon={<CalendarDays />}
          title={t('calendar.emptyTitle')}
          body={t('calendar.emptyBody')}
          action={<Button variant="primary" onClick={() => form.openCreate()}>{t('top.add')}</Button>}
        />
      ) : mobile ? (
        <DayList days={days} subs={subs} base={base} today={today} onSelect={setSelected} />
      ) : (
        <MonthGrid month={month} today={today} days={days} subs={subs} base={base} onSelect={setSelected} />
      )}

      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        {selected && (
          <SheetContent title={fmt(selected, locale, { weekday: 'long', month: 'long', day: 'numeric' })}>
            <DayPanel items={days[selected] ?? []} subs={subs} base={base} />
          </SheetContent>
        )}
      </Sheet>
    </div>
  );
}

/** Phone view: only the days that have payments, as a list. */
function DayList({
  days,
  subs,
  base,
  today,
  onSelect,
}: {
  days: ReturnType<typeof projectMonth>;
  subs: Map<number, import('../lib/types').ApiSubscription>;
  base: string;
  today: string;
  onSelect: (d: string) => void;
}) {
  const { locale } = useLocale();
  const entries = Object.entries(days);
  if (entries.length === 0) return <p className="py-10 text-center text-[13px] text-text-3">{t('calendar.monthEmpty')}</p>;
  return (
    <ul aria-label={t('calendar.listLabel')} className="overflow-hidden rounded-card border border-line bg-card">
      {entries.map(([date, items]) => (
        <li key={date} className="border-b border-line last:border-b-0">
          <button type="button" onClick={() => onSelect(date)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-sunk">
            <span className={cn('flex w-11 shrink-0 flex-col items-center rounded-ctl py-1', date === today ? 'bg-accent text-white' : 'bg-sunk text-text-2')}>
              <span className="text-[10.5px] uppercase">{fmt(date, locale, { weekday: 'short' })}</span>
              <span className="num text-[17px] leading-tight font-semibold">{Number(date.slice(8))}</span>
            </span>
            <span className="min-w-0 flex-1">
              {items.map((it) => {
                const s = subs.get(it.subscriptionId);
                return s ? (
                  <span key={`${it.subscriptionId}-${it.dueDate}`} className={cn('flex items-center gap-2 py-0.5', (it.state === 'projected' || it.state === 'skipped') && 'opacity-60')}>
                    <Logo sub={s} size={20} />
                    <span className={cn('truncate text-[14px]', it.state === 'overdue' && 'text-neg', it.state === 'skipped' && 'line-through')}>{s.name}</span>
                  </span>
                ) : null;
              })}
            </span>
            {dayTotal(items) > 0 && <Money minor={dayTotal(items)} currency={base} size="sm" />}
          </button>
        </li>
      ))}
    </ul>
  );
}
