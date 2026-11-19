import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppWindow } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Button } from '../../components/ui/Button';
import { t, useLocale } from '../../i18n';
import { shortDate } from '../../lib/dates';
import { Section } from './Section';

type Client = { clientId: string; clientName: string | null; createdAt: string; lastUsedAt: string | null; activeTokenCount: number };

export function ConnectedApps() {
  const { locale } = useLocale();
  const qc = useQueryClient();
  const clients = useQuery({ queryKey: ['oauth-clients'], queryFn: () => api.get<Client[]>('/oauth/clients') });
  const [target, setTarget] = useState<Client | null>(null);
  const del = useMutation({ mutationFn: (id: string) => api.del(`/oauth/clients/${encodeURIComponent(id)}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['oauth-clients'] }) });
  const list = clients.data ?? [];
  return (
    <Section title={t('settings.apps')} description={t('apps.desc')}>
      {list.length === 0 ? (
        <p className="text-sm text-text-3">{t('apps.none')}</p>
      ) : (
        <ul className="-mx-5 -my-5">
          {list.map((c) => (
            <li key={c.clientId} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-b-0">
              <AppWindow className="size-4 text-text-3" />
              <div className="min-w-0 flex-1">
                <b className="block truncate text-sm font-medium">{c.clientName ?? c.clientId}</b>
                <span className="text-xs text-text-3">{c.lastUsedAt ? t('keys.lastUsed', { date: shortDate(c.lastUsedAt.slice(0, 10), locale) }) : t('keys.neverUsed')}</span>
              </div>
              <Button size="sm" onClick={() => setTarget(c)}>
                {t('apps.disconnect')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!target}
        onOpenChange={(v) => !v && setTarget(null)}
        title={t('apps.disconnectTitle', { name: target?.clientName ?? target?.clientId ?? '' })}
        body={t('apps.disconnectBody')}
        confirmLabel={t('apps.disconnect')}
        onConfirm={() => target && del.mutate(target.clientId)}
      />
    </Section>
  );
}
