import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Trash2 } from 'lucide-react';
import { RadioGroup as R } from 'radix-ui';
import { useState } from 'react';
import { api } from '../../api';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { CopyField } from '../../components/CopyField';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { t, useLocale } from '../../i18n';
import { dateTimeIn, whenIn } from '../../lib/dates';
import { useSettings } from '../../lib/hooks';
import { Section } from './Section';
import { toast } from '../../components/ui/Toaster';
import { failureText } from '../../lib/failure';

type Scope = 'read' | 'full';
type Key = { id: number; name: string; prefix: string; scope: Scope; createdAt: string; lastUsedAt: string | null };

/** An ISO timestamp as "2 saat önce" / "12 Kas", in the user's time zone; the full date and time on hover. */
export function When({ iso }: { iso: string }) {
  const { locale } = useLocale();
  const zone = useSettings().data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <time dateTime={iso} title={dateTimeIn(iso, locale, zone)}>
      {whenIn(iso, locale, zone)}
    </time>
  );
}

/** "son kullanım 2 saat önce" or "hiç kullanılmadı". */
export function LastUsed({ iso }: { iso: string | null }) {
  return iso ? <Dated label="keys.lastUsed" iso={iso} /> : <>{t('keys.neverUsed')}</>;
}

/** A label with a {date} slot filled by <When>. */
export function Dated({ label, iso }: { label: string; iso: string }) {
  const [before, after] = t(label).split('{date}');
  return (
    <>
      {before}
      <When iso={iso} />
      {after}
    </>
  );
}

const scopeTile =
  'flex flex-1 flex-col gap-0.5 rounded-ctl border border-line-2 bg-card px-3.5 py-3 text-left outline-none hover:bg-sunk data-[state=checked]:border-accent data-[state=checked]:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent-soft focus-visible:border-accent';

export function ApiKeys() {
  const qc = useQueryClient();
  const keys = useQuery({ queryKey: ['keys'], queryFn: () => api.get<Key[]>('/keys') });
  const [name, setName] = useState('');
  const [scope, setScope] = useState<Scope>('read');
  const [fresh, setFresh] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<Key | null>(null);
  const create = useMutation({
    mutationFn: () => api.post<Key & { key: string }>('/keys', { name: name.trim(), scope }),
    onSuccess: (k) => {
      setFresh(k.key);
      setName('');
      setScope('read');
      void qc.invalidateQueries({ queryKey: ['keys'] });
    },
    onError: (e) => toast.error(failureText(e)),
  });
  const del = useMutation({ mutationFn: (id: number) => api.del(`/keys/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['keys'] }) });
  const list = keys.data ?? [];
  return (
    <Section id="keys" title={t('settings.keys')} description={t('keys.desc')}>
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
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <Input label={t('keys.name')} placeholder={t('keys.namePh')} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          <div className="flex flex-col gap-1.5">
            <span id="key-scope" className="text-[13px] font-medium text-text-2">
              {t('keys.scope')}
            </span>
            <R.Root aria-labelledby="key-scope" value={scope} onValueChange={(v) => setScope(v as Scope)} className="flex flex-col gap-2 sm:flex-row">
              {(['read', 'full'] as const).map((s) => (
                <R.Item key={s} value={s} aria-label={t(`keys.${s}`)} className={scopeTile}>
                  <span className="text-sm font-medium text-text">{t(`keys.${s}`)}</span>
                  <span className="text-xs text-text-2">{t(`keys.${s}Desc`)}</span>
                </R.Item>
              ))}
            </R.Root>
          </div>
          <Button type="submit" variant="primary" className="self-end" disabled={!name.trim() || create.isPending}>
            {t('keys.create')}
          </Button>
        </form>
      )}
      {list.length > 0 && (
        <ul className="-mx-5 -mb-5 border-t border-line">
          {list.map((k) => (
            <li key={k.id} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-b-0">
              <span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-sunk text-text-3">
                <KeyRound className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <b className="truncate text-sm font-medium">{k.name}</b>
                  <span className={k.scope === 'full' ? 'shrink-0 rounded-[6px] bg-accent-soft px-1.5 py-px text-[11.5px] font-medium text-accent' : 'shrink-0 rounded-[6px] bg-sunk px-1.5 py-px text-[11.5px] font-medium text-text-2'}>
                    {t(`keys.${k.scope}`)}
                  </span>
                </div>
                <span className="block truncate text-xs text-text-3">
                  <span className="num">{k.prefix}…</span> · <Dated label="keys.created" iso={k.createdAt} /> · <LastUsed iso={k.lastUsedAt} />
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
