import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { useMemo } from 'react';
import { api } from '../api';
import { fmt } from '../calendar/dates';
import { EmptyState } from '../components/EmptyState';
import { Logo } from '../components/Logo';
import { Money } from '../components/Money';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Tooltip } from '../components/ui/Tooltip';
import { t, useLocale } from '../i18n';
import { useSubscriptionForm } from '../layout/subscriptionForm';
import { useCategoryColor } from '../lib/categoryColor';
import { cn } from '../lib/cn';
import { useSubscriptions } from '../lib/hooks';

export type Report = {
  base: string;
  months: { month: string; paidMinor: number; projectedMinor: number }[];
  byCategory: { category: string | null; monthlyMinor: number }[];
  top: { subscriptionId: number; name: string; monthlyMinor: number }[];
  foreignShare: { minor: number; percent: number };
  unconvertible?: number[];
  ratesStale?: boolean;
};

const CURRENT = 12; // index of the current month: 12 past, current, 12 ahead

export function Reports() {
  const form = useSubscriptionForm();
  const report = useQuery({ queryKey: ['reports'], queryFn: () => api.get<Report>('/reports') }).data;

  if (!report) return <div className="px-4 pb-12 md:px-9"><Title /></div>;

  const empty = report.top.length === 0 && report.months.every((m) => m.paidMinor === 0 && m.projectedMinor === 0);
  const past = report.months.slice(0, CURRENT).reduce((s, m) => s + m.paidMinor, 0);
  const ahead = report.months.slice(CURRENT + 1).reduce((s, m) => s + m.projectedMinor, 0);

  return (
    <div className="px-4 pb-12 md:px-9">
      <Title />
      {empty ? (
        <EmptyState
          icon={<BarChart3 />}
          title={t('reports.emptyTitle')}
          body={t('reports.emptyBody')}
          action={<Button variant="primary" onClick={() => form.openCreate()}>{t('top.add')}</Button>}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label={t('reports.pastTotal')}><Money minor={past} currency={report.base} size="xl" /></Stat>
            <Stat label={t('reports.aheadTotal')}><Money minor={ahead} currency={report.base} size="xl" /></Stat>
            <Stat label={t('reports.foreign')}>
              <span className="font-display text-[26px]">{`${report.foreignShare.percent}%`}</span>
              <span className="ml-2 text-[13px] text-text-3">
                <Money minor={report.foreignShare.minor} currency={report.base} size="sm" /> {t('reports.perMonth')}
              </span>
            </Stat>
          </div>
          {(report.ratesStale || (report.unconvertible?.length ?? 0) > 0) && (
            <p className="text-xs text-warn">
              {report.ratesStale && t('month.stale')} {(report.unconvertible?.length ?? 0) > 0 && t('totals.excluded', { n: report.unconvertible!.length })}
            </p>
          )}
          <MonthlyChart report={report} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Categories report={report} />
            <Top report={report} />
          </div>
        </div>
      )}
    </div>
  );
}

function Title() {
  return (
    <div className="pt-2 pb-5">
      <h1 className="font-display text-[30px] leading-tight">{t('nav.reports')}</h1>
      <p className="mt-1 text-[13px] text-text-3">{t('reports.intro')}</p>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card className="px-5 py-4">
      <p className="text-[13px] text-text-3">{label}</p>
      <div className="mt-1 flex items-baseline">{children}</div>
    </Card>
  );
}

/** 25 monthly bars: paid solid, still expected soft; the current month stacks both and is marked. */
function MonthlyChart({ report }: { report: Report }) {
  const { locale } = useLocale();
  const max = Math.max(1, ...report.months.map((m) => m.paidMinor + m.projectedMinor));
  return (
    <Card>
      <CardHeader
        title={t('reports.monthly')}
        actions={
          <span className="flex items-center gap-3 text-[12px] text-text-3">
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-accent" />{t('reports.paid')}</span>
            <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-accent-soft ring-1 ring-accent/30 ring-inset" />{t('reports.expected')}</span>
          </span>
        }
      />
      <div className="px-3 pb-4 sm:px-5">
        <ul aria-label={t('reports.monthly')} className="flex h-[220px] items-stretch gap-[2px]">
          {report.months.map((m, i) => {
            const label = fmt(`${m.month}-01`, locale, { month: 'long', year: 'numeric' });
            const total = m.paidMinor + m.projectedMinor;
            return (
              <Tooltip
                key={m.month}
                content={
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium first-letter:uppercase">{label}</span>
                    {m.paidMinor > 0 && <span>{t('reports.paid')}: <Money minor={m.paidMinor} currency={report.base} size="sm" cents="inline" /></span>}
                    {m.projectedMinor > 0 && <span>{t('reports.expected')}: <Money minor={m.projectedMinor} currency={report.base} size="sm" cents="inline" /></span>}
                    {total === 0 && <span>—</span>}
                  </span>
                }
              >
                <li
                  tabIndex={0}
                  aria-current={i === CURRENT ? 'date' : undefined}
                  aria-label={label}
                  className="group flex min-w-0 flex-1 flex-col items-center gap-1.5 outline-none"
                >
                  <span className="flex w-full flex-1 flex-col justify-end gap-[2px] rounded-t-[4px] px-px sm:px-[3px] group-hover:bg-sunk group-focus-visible:bg-sunk">
                    {m.projectedMinor > 0 && (
                      <span className="w-full rounded-t-[4px] bg-accent-soft" style={{ height: `${(m.projectedMinor / max) * 100}%` }} />
                    )}
                    {m.paidMinor > 0 && (
                      <span className={cn('w-full bg-accent', m.projectedMinor > 0 ? '' : 'rounded-t-[4px]')} style={{ height: `${(m.paidMinor / max) * 100}%` }} />
                    )}
                  </span>
                  <span className={cn('h-4 text-[10.5px] whitespace-nowrap', i === CURRENT ? 'font-semibold text-text' : 'text-text-3')}>
                    {i % 3 === 0 || i === CURRENT ? fmt(`${m.month}-01`, locale, { month: 'short' }).replace('.', '') : ''}
                  </span>
                </li>
              </Tooltip>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}

function Categories({ report }: { report: Report }) {
  const colorOf = useCategoryColor();
  const total = report.byCategory.reduce((s, c) => s + c.monthlyMinor, 0) || 1;
  return (
    <Card>
      <CardHeader title={t('reports.byCategory')} sub={t('reports.perMonth')} />
      <ul className="flex flex-col gap-3 px-5 pb-5">
        {report.byCategory.map((c) => {
          const pct = (c.monthlyMinor / total) * 100;
          return (
            <li key={c.category ?? ''} className="flex flex-col gap-1.5">
              <span className="flex items-center gap-2 text-[14px]">
                <span className="size-2 rounded-full" style={{ background: colorOf(c.category) }} />
                <span className="min-w-0 flex-1 truncate">{c.category ?? t('reports.uncategorized')}</span>
                <span className="num text-[12px] text-text-3">{Math.round(pct)}%</span>
                <Money minor={c.monthlyMinor} currency={report.base} size="sm" />
              </span>
              <span className="h-1.5 overflow-hidden rounded-full bg-sunk">
                <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: colorOf(c.category) }} />
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Top({ report }: { report: Report }) {
  const subs = useSubscriptions().data;
  const byId = useMemo(() => new Map((subs ?? []).map((s) => [s.id, s])), [subs]);
  return (
    <Card>
      <CardHeader title={t('reports.top')} sub={t('reports.perMonth')} />
      <ul aria-label={t('reports.top')} className="divide-y divide-line px-5 pb-2">
        {report.top.map((x, i) => {
          const s = byId.get(x.subscriptionId);
          return (
            <li key={x.subscriptionId} className="flex items-center gap-3 py-3">
              <span className="num w-4 text-[12px] text-text-3">{i + 1}</span>
              <Logo sub={s ?? { name: x.name, logoPath: null }} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{x.name}</span>
                {s && s.currency !== report.base && <span className="text-[12px] text-text-3">{s.currency}</span>}
              </span>
              <Money minor={x.monthlyMinor} currency={report.base} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
