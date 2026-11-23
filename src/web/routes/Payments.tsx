import { Undo2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { Logo } from '../components/Logo';
import { Money } from '../components/Money';
import { Card } from '../components/ui/Card';
import { Select } from '../components/ui/Select';
import { t, useLocale } from '../i18n';
import { addDays, shortDate, todayIn } from '../lib/dates';
import { usePayments, useSettings, useSubscriptions, useSummary, useUndoPayment, type PaymentFilter } from '../lib/hooks';
import { toBaseMinor } from '../lib/money';
import { cn } from '../lib/cn';
import { ExportMenu } from '../components/ExportMenu';
import { useIsMobile } from '../lib/useMediaQuery';

const ALL = '*';

/** Date presets for the history filter, as [from, to] in the user's calendar (YYYY-MM-DD). */
export const RANGES: { id: string; dates: (today: string) => [string, string] }[] = [
  { id: 'month', dates: (d) => [`${d.slice(0, 7)}-01`, d] },
  { id: 'quarter', dates: (d) => [addMonths(`${d.slice(0, 7)}-01`, -2), d] },
  { id: 'year', dates: (d) => [`${d.slice(0, 4)}-01-01`, d] },
  { id: 'twelve', dates: (d) => [addDays(addMonths(d, -12), 1), d] },
];

function addMonths(iso: string, n: number): string {
  const [y, m, day] = iso.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

export function rangeId(from: string | undefined, to: string | undefined, today: string): string {
  if (!from && !to) return ALL;
  return RANGES.find((r) => { const [f, t2] = r.dates(today); return f === from && t2 === to; })?.id ?? 'custom';
}

export function Payments() {
  const { locale } = useLocale();
  const mobile = useIsMobile(); // the top bar carries Export on wider screens
  const [params, setParams] = useSearchParams();
  const settings = useSettings().data;
  const base = settings?.baseCurrency ?? 'USD';
  const today = todayIn(settings?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const subs = useSubscriptions().data ?? [];
  const byId = new Map(subs.map((s) => [s.id, s]));
  const undo = useUndoPayment();
  const filter: PaymentFilter = {
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    subscriptionId: params.get('subscriptionId') ? Number(params.get('subscriptionId')) : undefined,
    source: (params.get('source') as 'manual' | 'auto' | 'firefly' | null) ?? undefined,
    status: params.get('status') ?? undefined,
  };
  const payments = usePayments(filter);
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    if (!v || v === ALL) n.delete(k);
    else n.set(k, v);
    setParams(n, { replace: true });
  };
  const rows = payments.data ?? [];
  const rates = useSummary().data?.rates;
  // Real charged amount when known, else today's rate; payments with no rate at all add nothing.
  const total = rows.filter((p) => p.status === 'paid').reduce((a, p) => a + (p.actualBaseMinor ?? toBaseMinor(p.amountMinor, p.currency, base, rates) ?? 0), 0);

  return (
    <div className="flex flex-col gap-5 px-4 pt-2 pb-12 md:px-9">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <h1 className="font-display text-[26px] leading-tight md:text-[30px]">{t('nav.payments')}</h1>
          <p className="mt-0.5 text-text-2">{t('payments.count', { n: rows.length })}</p>
        </div>
        {mobile && <ExportMenu compact />}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Select
          aria-label={t('payments.range')}
          className="w-auto"
          value={rangeId(filter.from, filter.to, today)}
          onChange={(v) => {
            const n = new URLSearchParams(params);
            const r = RANGES.find((x) => x.id === v)?.dates(today);
            if (r) {
              n.set('from', r[0]);
              n.set('to', r[1]);
            } else {
              n.delete('from');
              n.delete('to');
            }
            setParams(n, { replace: true });
          }}
          options={[
            { value: ALL, label: t('payments.range.all') },
            ...RANGES.map((r) => ({ value: r.id, label: t(`payments.range.${r.id}`) })),
            ...(rangeId(filter.from, filter.to, today) === 'custom' ? [{ value: 'custom', label: `${filter.from ? shortDate(filter.from, locale) : '…'} – ${filter.to ? shortDate(filter.to, locale) : '…'}` }] : []),
          ]}
        />
        <Select
          aria-label={t('nav.subscriptions')}
          className="w-auto"
          value={params.get('subscriptionId') ?? ALL}
          onChange={(v) => set('subscriptionId', v)}
          options={[{ value: ALL, label: t('payments.allSubs') }, ...subs.map((s) => ({ value: String(s.id), label: s.name }))]}
        />
        <Select
          aria-label={t('subs.mode')}
          className="w-auto"
          value={filter.source ?? ALL}
          onChange={(v) => set('source', v)}
          options={[
            { value: ALL, label: t('subs.anyMode') },
            { value: 'auto', label: t('upcoming.auto') },
            { value: 'manual', label: t('upcoming.manual') },
            { value: 'firefly', label: t('activity.firefly') },
          ]}
        />
        <Select
          aria-label={t('subs.status')}
          className="w-auto"
          value={filter.status ?? ALL}
          onChange={(v) => set('status', v)}
          options={[
            { value: ALL, label: t('payments.anyStatus') },
            { value: 'paid', label: t('activity.manual') },
            { value: 'skipped', label: t('activity.skipped') },
            { value: 'void', label: t('history.void') },
          ]}
        />
      </div>
      <Card className="overflow-hidden">
        {payments.data && rows.length === 0 ? (
          <EmptyState title={t('payments.empty')} body={t('empty.noUpcomingFiltered')} />
        ) : (
          <ul>
            {rows.map((p) => {
              const s = byId.get(p.subscriptionId);
              const label = p.status === 'skipped' ? t('activity.skipped') : p.status === 'void' ? t('history.void') : p.source === 'auto' ? t('activity.auto') : p.source === 'firefly' ? t('activity.firefly') : t('activity.manual');
              return (
                <li key={p.id} data-testid="payment-row" className={cn('flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 md:px-5', p.status === 'void' && 'opacity-55')}>
                  {s && <Logo sub={s} size={34} />}
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-[15px] font-medium">{s?.name ?? `#${p.subscriptionId}`}</b>
                    <span className="text-[12.5px] text-text-3">
                      {shortDate(p.dueDate, locale)} · {label}
                    </span>
                  </div>
                  <div className="text-right">
                    {p.status === 'paid' && <Money minor={p.amountMinor} currency={p.currency} size="md" className="font-medium" />}
                    {p.actualBaseMinor !== null && p.currency !== base && <Money minor={p.actualBaseMinor} currency={base} size="sm" cents="inline" className="block text-text-3" />}
                  </div>
                  {p.status !== 'void' && (
                    <button type="button" aria-label={t('common.undo')} title={t('common.undo')} className="grid size-8 place-items-center rounded-[8px] text-text-3 hover:bg-sunk hover:text-text" onClick={() => undo.mutate(p.id)}>
                      <Undo2 className="size-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {rows.length > 0 && (
        <p className="text-right text-[13px] text-text-2">
          {t('payments.total')} <Money minor={total} currency={base} size="md" className="font-medium text-text" />
        </p>
      )}
    </div>
  );
}
