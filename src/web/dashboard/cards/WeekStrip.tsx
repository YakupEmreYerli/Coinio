import { Logo } from '../../components/Logo';
import { Card, CardHeader } from '../../components/ui/Card';
import { t, useLocale } from '../../i18n';
import { addDays, longDate, weekday } from '../../lib/dates';
import { useDashboardData } from '../useDueItems';
import { Link } from 'react-router-dom';

function compactMoney(minor: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100);
}

/** Monday–Sunday of the current week with the logos due each day. */
export function WeekStrip() {
  const { locale } = useLocale();
  const { summary, byId, today, base } = useDashboardData();
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const monday = addDays(today, -dow);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const items = [
    ...(summary?.paidThisMonth ?? []).map((p) => ({ id: p.subscriptionId, date: p.dueDate, minor: p.baseMinor })),
    ...(summary?.overdue ?? []).map((d) => ({ id: d.subscriptionId, date: d.dueDate, minor: d.baseMinor })),
    ...(summary?.upcoming ?? []).map((d) => ({ id: d.subscriptionId, date: d.dueDate, minor: d.baseMinor })),
  ];
  return (
    <Card>
      <CardHeader title={t('week.title')} actions={<Link to="/calendar" className="text-[13px] text-text-2 hover:text-text">{t('nav.calendar')}</Link>} />
      <ul className="grid grid-cols-7 gap-1.5 px-4 pb-4">
        {days.map((d) => {
          const here = items.filter((i) => i.date === d);
          const isToday = d === today;
          const total = here.reduce((a, i) => a + (i.minor ?? 0), 0);
          return (
            <li
              key={d}
              aria-label={longDate(d, locale)}
              aria-current={isToday ? 'date' : undefined}
              className={`flex min-h-[96px] flex-col items-center gap-1 rounded-[10px] px-0.5 pt-2 pb-2.5 ${isToday ? 'bg-primary text-primary-fg' : 'bg-sunk'}`}
            >
              <span className={`text-[11px] ${isToday ? 'opacity-70' : 'text-text-3'}`}>{weekday(d, locale)}</span>
              <span className="text-[15px] font-medium">{Number(d.slice(8))}</span>
              {here.length > 0 && (
                <>
                  <div className="mt-1 flex -space-x-2">
                    {here.slice(0, 2).map((i) => {
                      const s = byId.get(i.id);
                      return s ? <Logo key={i.id} sub={s} size={24} className="ring-2 ring-[var(--sunk)]" /> : null;
                    })}
                  </div>
                  <small className={`num text-[10.5px] ${isToday ? 'opacity-80' : 'text-text-2'}`}>{compactMoney(total, base, locale)}</small>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
