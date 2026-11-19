import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../../components/Logo';
import { Money } from '../../components/Money';
import { Card, CardHeader } from '../../components/ui/Card';
import { Select } from '../../components/ui/Select';
import { t, useLocale } from '../../i18n';
import { useSubscriptionForm } from '../../layout/subscriptionForm';
import { shortDate } from '../../lib/dates';
import { monthlyCost } from '../../lib/money';
import { useDashboardData } from '../useDueItems';

type Sort = 'cost' | 'name' | 'next';

export function AllSubscriptions() {
  const { locale } = useLocale();
  const form = useSubscriptionForm();
  const { subs, summary, base } = useDashboardData();
  const [sort, setSort] = useState<Sort>('cost');
  const rows = (subs ?? [])
    .filter((s) => s.active)
    .map((s) => ({ s, monthly: monthlyCost(s, base, summary?.rates) }))
    .sort((a, b) =>
      sort === 'cost' ? (b.monthly ?? -1) - (a.monthly ?? -1) : sort === 'name' ? a.s.name.localeCompare(b.s.name, locale) : a.s.nextDue.localeCompare(b.s.nextDue),
    );
  if (!subs || rows.length === 0) return null;
  return (
    <Card>
      <CardHeader
        title={t('all.title')}
        actions={
          <Select
            aria-label={t('all.sort')}
            className="h-[30px] w-auto text-[13px]"
            value={sort}
            onChange={(v) => setSort(v as Sort)}
            options={[
              { value: 'cost', label: t('all.byCost') },
              { value: 'name', label: t('all.byName') },
              { value: 'next', label: t('all.byNext') },
            ]}
          />
        }
      />
      <div className="grid grid-cols-2 gap-2.5 px-4 pb-4 sm:grid-cols-[repeat(auto-fill,minmax(196px,1fr))] md:gap-3 md:px-5 md:pb-5">
        {rows.map(({ s, monthly }) => (
          <Link key={s.id} to={`/subscriptions/${s.id}`} className="@container flex min-w-0 flex-col gap-3 rounded-[12px] border border-line bg-card p-3 transition-shadow hover:border-line-2 hover:shadow-[0_4px_14px_rgb(0_0_0/0.05)] md:p-4">
            <div className="flex min-w-0 items-center gap-3">
              <Logo sub={s} size={44} />
              <div className="min-w-0">
                <b className="block truncate text-[15px] font-medium">{s.name}</b>
                <span className="block truncate text-[12.5px] text-text-3 max-sm:hidden">{[s.category, s.paymentMethod].filter(Boolean).join(' · ')}</span>
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              {monthly === null ? <Money minor={s.amountMinor} currency={s.currency} size="xl" /> : <Money minor={monthly} currency={base} size="xl" approx={s.currency !== base} />}
              <small className="text-[13px] text-text-3">{t('all.perMonth')}</small>
            </div>
            <div className="flex justify-between border-t border-line pt-2.5 text-[12.5px] text-text-2">
              <span className="truncate">{t('all.next', { date: shortDate(s.nextDue, locale) })}</span>
              <span className="max-sm:hidden">{s.autoPay ? t('upcoming.auto') : t('all.manual')}</span>
            </div>
          </Link>
        ))}
        <button type="button" onClick={() => form.openCreate()} className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-line-2 text-text-3 hover:border-accent hover:text-accent">
          <Plus className="size-5" />
          {t('top.add')}
        </button>
      </div>
    </Card>
  );
}
