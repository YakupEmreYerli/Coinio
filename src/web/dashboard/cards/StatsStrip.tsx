import { Money } from '../../components/Money';
import { Card } from '../../components/ui/Card';
import { t, useLocale } from '../../i18n';
import { relativeDue, shortDate } from '../../lib/dates';
import { useReports } from '../../lib/hooks';
import { useDashboardData } from '../useDueItems';

const cap = (s: string, locale: string) => (s ? s[0]!.toLocaleUpperCase(locale) + s.slice(1) : s);

function Stat({ label, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="@container min-w-0 border-line px-5 py-[18px] [&:not(:first-child)]:border-l max-md:[&:nth-child(3)]:border-l-0 max-md:[&:nth-child(n+3)]:border-t">
      <div className="text-[13px] text-text-2">{label}</div>
      <div className="mt-1">{children}</div>
      {sub && <div className="mt-0.5 truncate text-[12.5px] text-text-3">{sub}</div>}
    </div>
  );
}

export function StatsStrip() {
  const { locale } = useLocale();
  const { summary, subs, base } = useDashboardData();
  const report = useReports().data;
  if (!summary || !subs || subs.length === 0) return null;
  const active = subs.filter((s) => s.active).length;
  const next = summary.upcoming[0];
  return (
    <Card className="grid grid-cols-2 md:grid-cols-4">
      <Stat label={t('stats.monthly')} sub={summary.unconvertible.length ? t('totals.excluded', { n: summary.unconvertible.length }) : t('stats.active', { n: active })}>
        <Money minor={summary.monthlyAverageMinor} currency={base} size="xl" />
      </Stat>
      <Stat label={t('stats.yearly')}>
        <Money minor={summary.yearlyTotalMinor} currency={base} size="xl" />
      </Stat>
      <Stat label={t('stats.foreign')} sub={report ? t('stats.foreignSub', { p: Math.round(report.foreignShare.percent) }) : undefined}>
        <Money minor={report?.foreignShare.minor ?? 0} currency={base} size="xl" />
      </Stat>
      <Stat label={t('stats.next')} sub={next ? `${next.name} · ${shortDate(next.dueDate, locale)}` : undefined}>
        <span className="font-display text-[26px]">{next ? cap(relativeDue(next.daysLeft), locale) : '—'}</span>
      </Stat>
    </Card>
  );
}
