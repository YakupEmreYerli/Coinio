import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, RefreshCw, XCircle } from 'lucide-react';
import { api } from '../../../api';
import { Button } from '../../../components/ui/Button';
import { t, useLocale } from '../../../i18n';
import { whenIn } from '../../../lib/dates';
import { keys } from '../../../lib/query';
import type { ApiNotificationLog } from '../../../lib/types';
import { Section } from '../Section';

export function RecentCard({ timezone }: { timezone: string }) {
  const { locale } = useLocale();
  const log = useQuery({ queryKey: keys.notificationLog, queryFn: () => api.get<ApiNotificationLog[]>('/notifications/log?limit=15') });
  const rows = log.data ?? [];
  return (
    <Section
      id="recent"
      title={t('notify.recent')}
      description={t('notify.recentDesc')}
      footer={
        <Button size="sm" variant="ghost" onClick={() => void log.refetch()} disabled={log.isFetching}>
          <RefreshCw />
          {t('notify.refresh')}
        </Button>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-text-2">{t('notify.recentEmpty')}</p>
      ) : (
        <ul className="-my-1 flex flex-col divide-y divide-line">
          {rows.map((r) => {
            const Icon = r.status === 'sent' ? CheckCircle2 : r.status === 'failed' ? XCircle : Clock;
            const tone = r.status === 'sent' ? 'text-pos' : r.status === 'failed' ? 'text-neg' : 'text-text-3';
            return (
              <li key={r.id} className="flex gap-3 py-2.5">
                <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-label={t(`notify.status.${r.status}`)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{r.title}</p>
                  <p className="text-[12px] text-text-3">
                    {[t(`notify.kind.${r.type}`), r.channelName ?? t('notify.deletedChannel'), whenIn(r.sentAt ?? r.createdAt, locale, timezone)].join(' · ')}
                    {r.status === 'failed' && r.attempts > 1 && ` · ${t('notify.attempts', { n: r.attempts })}`}
                  </p>
                  {r.error && <p className="mt-0.5 text-[12px] break-words text-neg">{r.error}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
