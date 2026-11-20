import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { todayIn } from '../../shared/schedule';
import { AgendaList } from '../calendar/AgendaList';
import { DayPanel } from '../calendar/DayPanel';
import { daysIn, fmt, isMonth, shiftMonth } from '../calendar/dates';
import { MonthGrid } from '../calendar/MonthGrid';
import { projectMonth } from '../calendar/projection';
import { dayTotal, defaultDay, monthSummary, type MonthSummary } from '../calendar/totals';
import { EmptyState } from '../components/EmptyState';
import { Money } from '../components/Money';
import { Button } from '../components/ui/Button';
import { Sheet, SheetContent } from '../components/ui/Sheet';
import { Skeleton } from '../components/ui/Skeleton';
import { t, useLocale } from '../i18n';
import { cn } from '../lib/cn';
import { usePayments, useSettings, useSubscriptions, useSummary } from '../lib/hooks';
import { useIsMobile } from '../lib/useMediaQuery';
import { useSubscriptionForm } from '../layout/subscriptionForm';

const countLabel = (n: number) => (n === 1 ? t('calendar.countOne') : t('calendar.count', { n }));

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
  const [picked, setPicked] = useState<string | null>(null);
  const [sheetDay, setSheetDay] = useState<string | null>(null);

  const subs = useMemo(() => new Map((subsQuery.data ?? []).map((s) => [s.id, s])), [subsQuery.data]);
  const base = summary?.base ?? settings?.baseCurrency ?? 'USD';
  const days = useMemo(
    () => projectMonth(subsQuery.data ?? [], payments ?? [], month, today, { base, rates: summary?.rates ?? {} }),
    [subsQuery.data, payments, month, today, base, summary?.rates],
  );
  const totals = useMemo(() => monthSummary(days), [days]);
  const selected = picked?.startsWith(month) ? picked : defaultDay(month, today, days);

  const go = (m: string) => setParams(m === today.slice(0, 7) ? {} : { month: m });
  const select = (date: string) => {
    if (!date.startsWith(month)) go(date.slice(0, 7));
    setPicked(date);
  };
  const goToday = () => select(today);

  const loading = !subsQuery.data || !payments;
  const noSubs = subsQuery.isSuccess && subsQuery.data.length === 0;
  const selectedItems = days[selected] ?? [];

  return (
    <div className="px-4 pb-10 md:px-9">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 pt-2 pb-4">
        <div className="min-w-0">
          <p className="text-[13px] text-text-3">{t('nav.calendar')}</p>
          <h1 className="font-display text-[28px] leading-tight first-letter:uppercase md:text-[30px]">
            {fmt(`${month}-01`, locale, { month: 'long', year: 'numeric' })}
          </h1>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="secondary" onClick={goToday}>
            {t('calendar.today')}
          </Button>
          <Button size="icon-sm" variant="secondary" aria-label={t('calendar.prev')} onClick={() => go(shiftMonth(month, -1))}>
            <ChevronLeft />
          </Button>
          <Button size="icon-sm" variant="secondary" aria-label={t('calendar.next')} onClick={() => go(shiftMonth(month, 1))}>
            <ChevronRight />
          </Button>
        </div>
      </div>

      {noSubs ? (
        <EmptyState
          icon={<CalendarDays />}
          title={t('calendar.emptyTitle')}
          body={t('calendar.emptyBody')}
          action={<Button variant="primary" onClick={() => form.openCreate()}>{t('top.add')}</Button>}
        />
      ) : loading ? (
        <CalendarSkeleton mobile={mobile} />
      ) : (
        <>
          <SummaryBar totals={totals} base={base} />
          {mobile ? (
            <AgendaList month={month} today={today} days={days} subs={subs} base={base} onSelect={setSheetDay} />
          ) : (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <MonthGrid month={month} today={today} days={days} subs={subs} base={base} selected={selected} onSelect={select} />
              <section aria-label={t('calendar.selectedDay')} className="relative min-h-[240px]">
                <div className="flex flex-col overflow-hidden rounded-card border border-line bg-card xl:absolute xl:inset-0">
                  <div className="flex items-end gap-3 border-b border-line px-4 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11.5px] font-medium tracking-wide text-text-3 uppercase">
                        {selected === today ? t('calendar.today') : fmt(selected, locale, { weekday: 'long' })}
                      </p>
                      <h2 className="font-display text-[20px] leading-tight">{fmt(selected, locale, { month: 'long', day: 'numeric' })}</h2>
                    </div>
                    {selectedItems.length > 0 && (
                      <div className="text-right">
                        <Money minor={dayTotal(selectedItems)} currency={base} className="font-medium" />
                        <p className="text-[11.5px] text-text-3">{countLabel(selectedItems.length)}</p>
                      </div>
                    )}
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {selectedItems.length === 0 && totals.count === 0 ? (
                      <p className="px-5 py-10 text-center text-[13px] text-text-3">{t('calendar.monthEmpty')}</p>
                    ) : (
                      <DayPanel items={selectedItems} subs={subs} base={base} />
                    )}
                  </div>
                </div>
              </section>
            </div>
          )}
        </>
      )}

      <Sheet open={mobile && sheetDay !== null} onOpenChange={(o) => !o && setSheetDay(null)}>
        {mobile && sheetDay && (
          <SheetContent title={fmt(sheetDay, locale, { weekday: 'long', month: 'long', day: 'numeric' })}>
            <DayPanel items={days[sheetDay] ?? []} subs={subs} base={base} />
          </SheetContent>
        )}
      </Sheet>
    </div>
  );
}

/** Month total, paid and remaining as quiet inline figures over one bar; no stat boxes. */
function SummaryBar({ totals, base }: { totals: MonthSummary; base: string }) {
  const paidPct = totals.total > 0 ? Math.round((totals.paid / totals.total) * 100) : 0;
  return (
    <div className="mb-4 flex flex-wrap items-end gap-x-8 gap-y-3">
      <Figure label={t('calendar.monthTotal')}>
        <Money minor={totals.total} currency={base} size="xl" className="leading-none" />
      </Figure>
      <Figure label={t('calendar.paidSoFar')} dot="bg-pos">
        <Money minor={totals.paid} currency={base} className="font-medium" />
      </Figure>
      <Figure label={t('calendar.remaining')} dot="bg-accent">
        <Money minor={totals.remaining} currency={base} className="font-medium" />
      </Figure>
      <div className="flex min-w-[160px] flex-1 flex-col gap-1.5 sm:max-w-[280px]">
        <p className="text-[12.5px] text-text-3">
          {totals.count === 0 ? t('calendar.monthEmpty') : countLabel(totals.count)}
          {totals.overdue > 0 && <span className="text-neg"> · {t('greet.late', { n: totals.overdue })}</span>}
        </p>
        <div
          role="progressbar"
          aria-label={t('calendar.paidSoFar')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={paidPct}
          className="flex h-1.5 overflow-hidden rounded-full bg-accent-soft"
        >
          <div className="h-full rounded-full bg-pos transition-[width]" style={{ width: `${paidPct}%` }} />
        </div>
      </div>
    </div>
  );
}

function Figure({ label, dot, children }: { label: string; dot?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-[12.5px] text-text-3">
        {dot && <span aria-hidden className={cn('size-1.5 rounded-full', dot)} />}
        {label}
      </span>
      {children}
    </div>
  );
}

function CalendarSkeleton({ mobile }: { mobile: boolean }) {
  return (
    <div aria-busy className="flex flex-col gap-4">
      <div className="flex gap-8">
        <Skeleton className="h-11 w-36" />
        <Skeleton className="h-11 w-24" />
        <Skeleton className="h-11 w-24" />
      </div>
      {mobile ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16 w-full rounded-card" />)}
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid grid-cols-8 gap-px overflow-hidden rounded-card border border-line bg-line">
            {Array.from({ length: 40 }, (_, i) => (
              <div key={i} className="h-[clamp(76px,calc((100dvh-336px)/6),104px)] bg-card p-2">
                <Skeleton className="size-6 rounded-full" />
              </div>
            ))}
          </div>
          <Skeleton className="hidden h-full min-h-[240px] rounded-card xl:block" />
        </div>
      )}
    </div>
  );
}
