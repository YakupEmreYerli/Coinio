import { Logo } from '../components/Logo';
import { Money } from '../components/Money';
import { useLocale } from '../i18n';
import { cn } from '../lib/cn';
import type { ApiSubscription } from '../lib/types';
import { daysIn, fmt, weekdayIndex } from './dates';
import type { DayItem } from './projection';

const MAX_LOGOS = 3;

export function dayTotal(items: DayItem[]): number {
  return items.reduce((s, i) => s + (i.state === 'skipped' ? 0 : (i.baseMinor ?? 0)), 0);
}

export function MonthGrid({
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
  const first = `${month}-01`;
  const lead = weekdayIndex(first);
  const count = daysIn(month);
  // A Monday-first header, named in the viewer's language (2024-01-01 was a Monday).
  const weekdays = Array.from({ length: 7 }, (_, i) => fmt(`2024-01-0${i + 1}`, locale, { weekday: 'short' }));

  return (
    <div className="overflow-hidden rounded-card border border-line bg-card">
      <div className="grid grid-cols-7 border-b border-line">
        {weekdays.map((w) => (
          <div key={w} className="px-3 py-2 text-[12px] font-medium tracking-wide text-text-3 uppercase">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: lead }, (_, i) => (
          <div key={`lead-${i}`} className="min-h-[112px] border-r border-b border-line bg-sunk/40" />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, '0')}`;
          const items = days[date] ?? [];
          const isToday = date === today;
          const overdue = items.some((x) => x.state === 'overdue');
          const total = dayTotal(items);
          const col = (lead + i) % 7;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect(date)}
              aria-label={fmt(date, locale, { weekday: 'long', month: 'long', day: 'numeric' })}
              className={cn(
                'group flex min-h-[112px] flex-col gap-1.5 border-b border-line p-2.5 text-left transition-colors hover:bg-sunk/60 focus-visible:relative focus-visible:outline-2 focus-visible:outline-accent',
                col < 6 && 'border-r',
                date < today && 'bg-sunk/25',
              )}
            >
              <span
                className={cn(
                  'num grid size-6 place-items-center rounded-full text-[12.5px]',
                  isToday ? 'bg-accent font-semibold text-white' : overdue ? 'font-semibold text-neg' : 'text-text-2',
                )}
              >
                {i + 1}
              </span>
              {items.length > 0 && (
                <>
                  <span className="flex items-center -space-x-1.5">
                    {items.slice(0, MAX_LOGOS).map((it) => {
                      const s = subs.get(it.subscriptionId);
                      return s ? (
                        <Logo
                          key={`${it.subscriptionId}-${it.dueDate}`}
                          sub={s}
                          size={22}
                          className={cn(
                            'ring-2',
                            it.state === 'overdue' ? 'ring-neg' : 'ring-card',
                            (it.state === 'projected' || it.state === 'skipped') && 'opacity-55',
                          )}
                        />
                      ) : null;
                    })}
                    {items.length > MAX_LOGOS && <span className="pl-2.5 text-[11.5px] text-text-3">+{items.length - MAX_LOGOS}</span>}
                  </span>
                  {total > 0 && (
                    <Money minor={total} currency={base} size="sm" className={cn('mt-auto', items.every((x) => x.state === 'paid' || x.state === 'skipped') ? 'text-text-3' : 'text-text')} />
                  )}
                </>
              )}
            </button>
          );
        })}
        {Array.from({ length: (7 - ((lead + count) % 7)) % 7 }, (_, i) => (
          <div key={`tail-${i}`} className={cn('min-h-[112px] border-b border-line bg-sunk/40', i < (7 - ((lead + count) % 7)) % 7 - 1 && 'border-r')} />
        ))}
      </div>
    </div>
  );
}
