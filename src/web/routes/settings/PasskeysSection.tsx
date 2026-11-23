import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, KeyRound, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { api, ApiError } from '../../api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { toast } from '../../components/ui/Toaster';
import { formatDate, getLocale, t } from '../../i18n';
import { isPasskeySupported, isUserCancel, registerPasskey, type PasskeyMeta, type PasskeysListResponse } from '../../lib/passkeys';
import { Section } from './Section';

const MAX_PASSKEYS = 10;

export function PasskeysSection(props: { onChanged?: () => void }) {
  const qc = useQueryClient();
  const browserOk = isPasskeySupported();
  const { data, isLoading } = useQuery({
    queryKey: ['passkeys'],
    queryFn: () => api.get<PasskeysListResponse>('/auth/passkeys'),
  });

  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const locale = getLocale();
  const list = data?.passkeys ?? [];
  const supported = data?.supported ?? true;
  const atLimit = list.length >= MAX_PASSKEYS;

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['passkeys'] });
    props.onChanged?.();
  };

  const handleAdd = async () => {
    setAdding(true);
    try {
      await registerPasskey(newName);
      setNewName('');
      toast.success(t('passkey.added'));
      await refresh();
    } catch (err) {
      if (!isUserCancel(err)) {
        toast.error(err instanceof ApiError && err.code === 'limit_reached' ? t('passkey.limitReached', { n: MAX_PASSKEYS }) : t('passkey.failed'));
      }
    } finally {
      setAdding(false);
    }
  };

  const saveRename = async (item: PasskeyMeta) => {
    const trimmed = editingName.trim();
    if (!trimmed || trimmed === item.name) {
      setEditingId(null);
      return;
    }
    setBusyId(item.id);
    try {
      await api.patch(`/auth/passkey/${encodeURIComponent(item.id)}`, { name: trimmed });
      setEditingId(null);
      toast.success(t('passkey.saved'));
      await refresh();
    } catch {
      toast.error(t('error.generic'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      await api.del(`/auth/passkey/${encodeURIComponent(id)}`);
      toast.success(t('passkey.deleted'));
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError && err.code === 'last_sign_in' ? t('passkey.lastSignIn') : t('error.generic'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Section title={t('passkey.title')} description={t('passkey.description')}>
      {!browserOk ? (
        <p className="text-[13px] text-text-3">{t('passkey.unsupported')}</p>
      ) : data && !supported ? (
        <p className="text-[13px] text-text-3">{t('passkey.httpsRequired')}</p>
      ) : (
        <>
          {!isLoading && list.length === 0 ? (
            <p className="text-[13px] text-text-3">{t('passkey.empty')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-ctl border border-line bg-sunk/40">
              {list.map((item) => {
                const isEditing = editingId === item.id;
                const isBusy = busyId === item.id;
                return (
                  <li key={item.id} className="flex flex-wrap items-center gap-3 px-3.5 py-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-ctl border border-line bg-card text-text-2">
                      <KeyRound className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            aria-label={t('passkey.rename')}
                            value={editingName}
                            maxLength={60}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void saveRename(item);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            className="h-8 text-[13px]"
                          />
                          <Button size="sm" onClick={() => void saveRename(item)} disabled={isBusy || !editingName.trim()} aria-label={t('common.save')}>
                            <Check className="size-3.5" aria-hidden />
                          </Button>
                          <Button size="sm" onClick={() => setEditingId(null)} aria-label={t('common.cancel')}>
                            <X className="size-3.5" aria-hidden />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-[14px] font-medium text-text">{item.name}</span>
                            <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[11px] text-text-2">
                              {item.backedUp ? t('passkey.synced') : t('passkey.thisDevice')}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[12px] text-text-3">
                            {t('passkey.created', { date: formatDate(item.createdAt.slice(0, 10), locale) })}
                            {' · '}
                            {item.lastUsedAt
                              ? t('passkey.lastUsed', { date: formatDate(item.lastUsedAt.slice(0, 10), locale) })
                              : t('passkey.neverUsed')}
                          </p>
                        </>
                      )}
                    </div>
                    {!isEditing && (
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          onClick={() => {
                            setEditingId(item.id);
                            setEditingName(item.name);
                          }}
                          disabled={isBusy}
                          aria-label={t('passkey.rename')}
                        >
                          <Pencil className="size-3.5" aria-hidden />
                        </Button>
                        <Button size="sm" onClick={() => void handleDelete(item.id)} disabled={isBusy} aria-label={t('passkey.delete')}>
                          <Trash2 className="size-3.5" aria-hidden />
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[180px] flex-1">
              <Input
                label={t('passkey.nameLabel')}
                placeholder={t('passkey.namePlaceholder')}
                value={newName}
                maxLength={60}
                onChange={(e) => setNewName(e.target.value)}
                disabled={adding || atLimit}
              />
            </div>
            <Button variant="primary" onClick={() => void handleAdd()} disabled={adding || atLimit || isLoading}>
              {adding ? <Loader2 className="animate-spin" aria-hidden /> : <KeyRound aria-hidden />}
              {adding ? t('passkey.adding') : t('passkey.add')}
            </Button>
          </div>
          {atLimit && <p className="text-[12.5px] text-text-3">{t('passkey.limitReached', { n: MAX_PASSKEYS })}</p>}
        </>
      )}
    </Section>
  );
}
