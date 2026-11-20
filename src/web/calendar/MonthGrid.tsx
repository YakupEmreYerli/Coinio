import { Check } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Logo } from '../components/Logo';
import { Money } from '../components/Money';
import { t, useLocale } from '../i18n';
import { cn } from '../lib/cn';
import type { ApiSubscription } from '../lib/types';
import { addDays, fmt, monthWeeks, weekdayIndex } from './dates';
import type { DayItem } from './projection';
import { dayTotal, weekTotals } from './totals';

const MAX_LOGOS = 3;
/** The day a key press moved to; focused once the grid shows it. */
let pendingFocus: string | null = null;
const KEY_STEP: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

// Cell backgrounds are opaque mixes so the 1px grid lines (the container's colour showing through the gaps) stay crisp.
const CELL = {
  base: 'var(--card)',
  weekend: 'color-mix(in oklab, var(--sunk) 45%, var(--card))',
  today: 'color-mix(in oklab, var(--accent) 6%, var(--card))',
  outside: 'color-mix(in oklab, var(--sunk) 55%, var(--card))',
  week: 'color-mix(in oklab, var(--sunk) 70%, var(--card))',
};

/**
 * Month view: seven day columns plus a week total column. Arrow keys move the selection (and focus) a day or a
 * week at a time; stepping past the month's edge hands the new date to `onSelect`, which turns the page.
 */
export function MonthGrid({
  month,
  today,
  days,
  subs,
  base,
  selected,
  onSelect,
}: {
  month: string;
  today: string;
  days: Record<string, DayItem[]>;
  subs: Map<number, ApiSubscription>;
  base: string;
  selected: string;
  onSelect: (date: string) => void;
}) {
  const { locale } = useLocale();
  const weeks = monthWeeks(month);
  const totals = weekTotals(weeks, days);
  // A Monday-first header, named in the viewer's language (2024-01-01 was a Monday).
  const weekdays = Array.from({ length: 7 }, (_, i) => fmt(`2024-01-0${i + 1}`, locale, { weekday: 'short' }));
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Module-level, because crossing into another month can remount the grid.
    if (pendingFocus !== selected) return;
    pendingFocus = null;
    root.current?.querySelector<HTMLButtonElement>(`[data-date="${selected}"]`)?.focus();
  }, [selected, month]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    let next: string | null = null;
    if (e.key in KEY_STEP) next = addDays(selected, KEY_STEP[e.key]!);
    else if (e.key === 'Home') next = addDays(selected, -weekdayIndex(selected));
    else if (e.key === 'End') next = addDays(selected, 6 - weekdayIndex(selected));
    if (!next) return;
    e.preventDefault();
    pendingFocus = next;
    onSelect(next);
  };

  return (
    // Rows share the height left under the page header, so a six-week month still fits a 900px-tall window.
    <div className="overflow-hidden rounded-card border border-line bg-card" style={{ '--cal-row': 'clamp(76px, calc((100dvh - 336px) / 6), 104px)' } as React.CSSProperties}>
      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_minmax(84px,0.95fr)] border-b border-line">
        {weekdays.map((w, i) => (
          <div key={w} className={cn('px-2.5 py-2 text-[11.5px] font-medium tracking-wide text-text-3 uppercase', i >= 5 && 'text-text-3/80')}>
            {w}
          </div>
        ))}
        <div className="px-2.5 py-2 text-right text-[11.5px] font-medium tracking-wide text-text-3 uppercase" style={{ background: CELL.week }}>
          {t('calendar.week')}
        </div>
      </div>
      <div ref={root} role="grid" aria-label={fmt(`${month}-01`, locale, { month: 'long', year: 'numeric' })} onKeyDown={onKey} className="grid gap-px bg-line">
        {weeks.map((week, w) => (
          <div key={week[0]} role="row" className="grid grid-cols-[repeat(7,minmax(0,1fr))_minmax(84px,0.95fr)] gap-px">
            {week.map((date) => (
              <DayCell
                key={date}
                date={date}
                inMonth={date.startsWith(month)}
                today={today}
                selected={date === selected}
                items={days[date] ?? []}
                subs={subs}
                base={base}
                onSelect={onSelect}
              />
            ))}
            <div role="gridcell" className="flex h-[var(--cal-row)] flex-col items-end justify-end px-2.5 py-2" style={{ background: CELL.week }}>
              {totals[w]! > 0 ? (
                <Money minor={totals[w]!} currency={base} size="sm" className="text-[13px] font-medium text-text-2" />
              ) : (
                <span className="text-[13px] text-text-3/60">—</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DayCell({
  date,
  inMonth,
  today,
  selected,
  items,
  subs,
  base,
  onSelect,
}: {
  date: string;
  inMonth: boolean;
  today: string;
  selected: boolean;
  items: DayItem[];
  subs: Map<number, ApiSubscription>;
  base: string;
  onSelect: (date: string) => void;
}) {
  const { locale } = useLocale();
  const day = Number(date.slice(8));
  const isToday = date === today;
  const past = date < today;
  const weekend = weekdayIndex(date) >= 5;

  if (!inMonth) {
    return (
      <div role="gridcell" aria-hidden className="h-[var(--cal-row)] p-2" style={{ background: CELL.outside }}>
        <span className="num grid size-6 place-items-center text-[12.5px] text-text-3/55">{day}</span>
      </div>
    );
  }

  const overdue = items.some((x) => x.state === 'overdue');
  const settled = items.length > 0 && items.every((x) => x.state === 'paid' || x.state === 'skipped');
  const total = dayTotal(items);
  const bg = isToday ? CELL.today : weekend ? CELL.weekend : CELL.base;

  return (
    <div role="gridcell" aria-selected={selected} className="relative">
      <button
        type="button"
        data-date={date}
        tabIndex={selected ? 0 : -1}
        aria-current={isToday ? 'date' : undefined}
        aria-label={fmt(date, locale, { weekday: 'long', month: 'long', day: 'numeric' })}
        onClick={() => onSelect(date)}
        style={{ '--cell': bg } as React.CSSProperties}
        className={cn(
          'group flex h-[var(--cal-row)] w-full flex-col items-start gap-1.5 bg-[var(--cell)] p-2 text-left outline-none transition-colors',
          'hover:bg-[color-mix(in_oklab,var(--sunk)_70%,var(--cell))] focus-visible:z-10 focus-visible:shadow-[inset_0_0_0_2px_var(--accent)]',
          selected && 'z-[5] shadow-[inset_0_0_0_1.5px_var(--accent)]',
        )}
      >
        <span className="flex w-full items-center gap-1.5">
          <span
            className={cn(
              'num grid size-6 place-items-center rounded-full text-[12.5px] tabular-nums',
              isToday ? 'bg-accent font-semibold text-white' : past ? 'text-text-3' : 'font-medium text-text',
            )}
          >
            {day}
          </span>
          {overdue && <span aria-hidden className="size-1.5 rounded-full bg-neg" />}
        </span>
        {items.length > 0 && (
          <>
            <span className="flex items-center pl-0.5">
              {items.slice(0, MAX_LOGOS).map((it, i) => {
                const s = subs.get(it.subscriptionId);
                return s ? (
                  <Logo
                    key={`${it.subscriptionId}-${it.dueDate}`}
                    sub={s}
                    size={22}
                    className={cn(
                      'ring-2 ring-[var(--cell)]',
                      i > 0 && '-ml-1.5',
                      (it.state === 'skipped' || (past && it.state === 'paid')) && 'opacity-60 grayscale-[0.4]',
                    )}
                  />
                ) : null;
              })}
              {items.length > MAX_LOGOS && (
                <span className="num -ml-1.5 grid h-[22px] min-w-[22px] place-items-center rounded-full bg-sunk px-1 text-[10.5px] font-medium text-text-2 ring-2 ring-[var(--cell)]">
                  +{items.length - MAX_LOGOS}
                </span>
              )}
            </span>
            {total > 0 && (
              <span className={cn('mt-auto flex items-center gap-1', overdue ? 'text-neg' : settled ? 'text-text-3' : 'text-text')}>
                <Money minor={total} currency={base} size="sm" className="text-[13px] font-medium" />
                {settled && <Check aria-hidden className="size-3 shrink-0" strokeWidth={2.5} />}
              </span>
            )}
          </>
        )}
      </button>
    </div>
  );
}
