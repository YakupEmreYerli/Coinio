import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { CopyField } from '../../components/CopyField';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { t, useLocale } from '../../i18n';
import { shortDate } from '../../lib/dates';
import { Section } from './Section';

type Key = { id: number; name: string; prefix: string; scope: 'read' | 'full'; createdAt: string; lastUsedAt: string | null };

export function ApiKeys() {
  const { locale } = useLocale();
  const qc = useQueryClient();
  const keys = useQuery({ queryKey: ['keys'], queryFn: () => api.get<Key[]>('/keys') });
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'read' | 'full'>('full');
  const [fresh, setFresh] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<Key | null>(null);
  const create = useMutation({
    mutationFn: () => api.post<Key & { key: string }>('/keys', { name: name.trim(), scope }),
    onSuccess: (k) => {
      setFresh(k.key);
      setName('');
      void qc.invalidateQueries({ queryKey: ['keys'] });
    },
  });
  const del = useMutation({ mutationFn: (id: number) => api.del(`/keys/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['keys'] }) });
  return (
    <Section title={t('settings.keys')} description={t('keys.desc')}>
      {fresh ? (
        <div className="flex flex-col gap-3 rounded-ctl border border-accent bg-accent-soft p-4">
          <p className="text-sm font-medium">{t('keys.copyNow')}</p>
          <CopyField value={fresh} label={t('keys.newKey')} />
          <Button size="sm" variant="primary" className="self-end" onClick={() => setFresh(null)}>
            {t('keys.done')}
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <div className="flex-1">
            <Input label={t('keys.name')} placeholder={t('keys.namePh')} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </div>
          <SegmentedControl label={t('keys.scope')} value={scope} onChange={setScope} options={[{ value: 'full', label: t('keys.full') }, { value: 'read', label: t('keys.read') }]} className="h-10 items-center" />
          <Button type="submit" variant="primary" disabled={!name.trim() || create.isPending}>
            {t('keys.create')}
          </Button>
        </form>
      )}
      {(keys.data ?? []).length > 0 && (
        <ul className="-mx-5 border-t border-line">
          {keys.data!.map((k) => (
            <li key={k.id} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-b-0">
              <KeyRound className="size-4 text-text-3" />
              <div className="min-w-0 flex-1">
                <b className="block truncate text-sm font-medium">{k.name}</b>
                <span className="num text-xs text-text-3">
                  {k.prefix}… · {k.scope === 'full' ? t('keys.full') : t('keys.read')} · {k.lastUsedAt ? t('keys.lastUsed', { date: shortDate(k.lastUsedAt.slice(0, 10), locale) }) : t('keys.neverUsed')}
                </span>
              </div>
              <Button size="icon-sm" variant="ghost" aria-label={t('keys.revokeNamed', { name: k.name })} onClick={() => setRevoke(k)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!revoke}
        onOpenChange={(v) => !v && setRevoke(null)}
        title={t('keys.revokeTitle', { name: revoke?.name ?? '' })}
        body={t('keys.revokeBody')}
        confirmLabel={t('keys.revoke')}
        onConfirm={() => revoke && del.mutate(revoke.id)}
      />
    </Section>
  );
}
