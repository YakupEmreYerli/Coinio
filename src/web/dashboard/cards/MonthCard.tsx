import { ChevronDown } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState';
import { Money } from '../../components/Money';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { t, useLocale } from '../../i18n';
import { useSubscriptionForm } from '../../layout/subscriptionForm';
import { monthName } from '../../lib/dates';
import { buildMonthSeries } from '../monthSeries';
import { useDashboardData } from '../useDueItems';
import { MonthChart } from './MonthChart';

export function MonthCard() {
  const { locale } = useLocale();
  const form = useSubscriptionForm();
  const { summary, subs, byId, today, base } = useDashboardData();
  if (!summary) return <Card className="h-[288px] animate-pulse" />;
  if (subs && subs.length === 0) {
    return (
      <Card>
        <EmptyState title={t('empty.noSubs')} body={t('empty.noSubsBody')} action={<Button variant="primary" onClick={() => form.openCreate()}>{t('top.add')}</Button>} />
      </Card>
    );
  }
  const month = today.slice(0, 7);
  const paidItems = summary.paidThisMonth.map((p) => ({ dueDate: p.dueDate, baseMinor: p.baseMinor ?? 0, subscriptionId: p.subscriptionId }));
  const pendingThisMonth = summary.upcoming.filter((d) => d.dueDate.startsWith(month));
  const pending = [
    ...summary.overdue.map((d) => ({ dueDate: d.dueDate, baseMinor: d.baseMinor ?? 0, overdue: true, subscriptionId: d.subscriptionId })),
    ...pendingThisMonth.map((d) => ({ dueDate: d.dueDate, baseMinor: d.baseMinor ?? 0, overdue: false, subscriptionId: d.subscriptionId })),
  ];
  const series = buildMonthSeries({ today, paid: paidItems, pending });
  const paidSum = paidItems.reduce((a, p) => a + p.baseMinor, 0);
  const overdueSum = summary.overdue.reduce((a, d) => a + (d.baseMinor ?? 0), 0);
  const pendingSum = pendingThisMonth.reduce((a, d) => a + (d.baseMinor ?? 0), 0);
  return (
    <Card className="grid md:grid-cols-[minmax(300px,360px)_1fr]">
      <div className="@container flex min-w-0 flex-col border-line p-6 md:border-r">
        <div className="flex items-center gap-1 text-sm text-text-2">
          {t('month.left')}
          <ChevronDown className="size-3 opacity-0" aria-hidden />
        </div>
        <div className="mt-2">
          <Money minor={summary.leftThisMonthMinor} currency={base} size="hero" />
        </div>
        <p className="mt-1.5 text-[13.5px] text-text-2">
          {t('month.total', { month: monthName(today, locale) })} <Money minor={series.total} currency={base} size="sm" cents="inline" className="font-sans" />
          {summary.ratesStale && <span className="block text-xs text-warn">{t('month.stale')}</span>}
          {summary.unconvertible.length > 0 && <span className="block text-xs text-warn">{t('totals.excluded', { n: summary.unconvertible.length })}</span>}
        </p>
        <div className="mt-auto flex flex-col gap-2.5 pt-6">
          {[
            ['month.paid', paidSum, 'var(--pos)'],
            ['month.pending', pendingSum, 'var(--accent)'],
            ['month.overdue', overdueSum, 'var(--neg)'],
          ].map(([k, v, c]) => (
            <div key={k as string} className="flex items-center text-sm text-text-2">
              <i className="mr-2.5 h-[15px] w-[3px] rounded-sm" style={{ background: c as string }} />
              {t(k as string)}
              <Money minor={v as number} currency={base} size="md" cents="inline" className="ml-auto font-medium text-text" />
            </div>
          ))}
        </div>
      </div>
      <div className="hidden px-5 pt-4 pb-2 md:block">
        <MonthChart series={series} byId={byId} month={month} currency={base} />
      </div>
    </Card>
  );
}
