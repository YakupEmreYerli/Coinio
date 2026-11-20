import { ChevronRight } from 'lucide-react';
import { Logo } from '../components/Logo';
import { Money } from '../components/Money';
import { t, useLocale } from '../i18n';
import { cn } from '../lib/cn';
import type { ApiSubscription } from '../lib/types';
import { fmt, monthWeeks } from './dates';
import type { DayItem } from './projection';
import { weekTotals } from './totals';

/**
 * Phone view: the month as an agenda, grouped by week with each week's total. Only days with payments are listed,
 * plus today so the reader always knows where they are.
 */
export function AgendaList({
  month,
  today,
  days,
  subs,
  base,
  onSelect,
}: {
  month: string;
  today: string;
  days: Record<string, DayItem[]>;
  subs: Map<number, ApiSubscription>;
  base: string;
  onSelect: (date: string) => void;
}) {
  const { locale } = useLocale();
  const weeks = monthWeeks(month);
  const totals = weekTotals(weeks, days);
  const shown = (d: string) => d.startsWith(month) && ((days[d]?.length ?? 0) > 0 || d === today);
  const groups = weeks.map((week, i) => ({ week, total: totals[i]!, dates: week.filter(shown) })).filter((g) => g.dates.length > 0);

  if (groups.length === 0) {
    return (
      <section aria-label={t('calendar.listLabel')} className="rounded-card border border-dashed border-line-2 px-6 py-10 text-center text-[13px] text-text-3">
        {t('calendar.monthEmpty')}
      </section>
    );
  }

  const range = (week: string[]) => {
    const [a, b] = [week[0]!, week[6]!];
    const sameMonth = a.slice(0, 7) === b.slice(0, 7);
    return `${fmt(a, locale, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })} – ${fmt(b, locale, { day: 'numeric', month: 'short' })}`;
  };

  return (
    <section aria-label={t('calendar.listLabel')} className="flex flex-col gap-5">
      {groups.map(({ week, total, dates }) => (
        <div key={week[0]}>
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h3 className="text-[12px] font-medium tracking-wide text-text-3 uppercase">{range(week)}</h3>
            {total > 0 && <Money minor={total} currency={base} size="sm" className="text-text-2" />}
          </div>
          <ul className="overflow-hidden rounded-card border border-line bg-card">
            {dates.map((date) => {
              const items = days[date] ?? [];
              const isToday = date === today;
              const past = date < today;
              return (
                <li key={date} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    aria-current={isToday ? 'date' : undefined}
                    aria-label={fmt(date, locale, { weekday: 'long', month: 'long', day: 'numeric' })}
                    onClick={() => onSelect(date)}
                    className={cn('flex w-full items-start gap-3 px-3.5 py-3 text-left active:bg-sunk', isToday && 'bg-[color-mix(in_oklab,var(--accent)_5%,var(--card))]')}
                  >
                    <span
                      className={cn(
                        'flex w-10 shrink-0 flex-col items-center rounded-ctl py-1',
                        isToday ? 'bg-accent text-white' : past ? 'bg-sunk text-text-3' : 'bg-sunk text-text-2',
                      )}
                    >
                      <span className="text-[10px] font-medium uppercase">{fmt(date, locale, { weekday: 'short' })}</span>
                      <span className="num text-[16px] leading-tight font-semibold">{Number(date.slice(8))}</span>
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-2 py-0.5">
                      {items.length === 0 && <span className="py-1.5 text-[13.5px] text-text-3">{t('calendar.dayEmpty')}</span>}
                      {items.map((it) => {
                        const s = subs.get(it.subscriptionId);
                        if (!s) return null;
                        const muted = it.state === 'skipped' || it.state === 'paid';
                        return (
                          <span key={`${it.subscriptionId}-${it.dueDate}`} className="flex items-center gap-2.5">
                            <Logo sub={s} size={26} className={cn(it.state === 'skipped' && 'opacity-60')} />
                            <span className="min-w-0 flex-1">
                              <span className={cn('block truncate text-[14.5px] font-medium', it.state === 'skipped' && 'text-text-3 line-through')}>{s.name}</span>
                              <span className={cn('block text-[12px]', it.state === 'overdue' ? 'text-neg' : it.state === 'paid' ? 'text-pos' : 'text-text-3')}>
                                {t(`calendar.state.${it.state}`)}
                                {s.autoPay && !muted && ` · ${t('calendar.autoShort')}`}
                              </span>
                            </span>
                            {it.state !== 'skipped' && it.baseMinor !== null && (
                              <Money minor={it.baseMinor} currency={base} className={cn('font-medium', muted ? 'text-text-3' : 'text-text')} />
                            )}
                          </span>
                        );
                      })}
                    </span>
                    <ChevronRight aria-hidden className="mt-3 size-4 shrink-0 text-text-3/70" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
