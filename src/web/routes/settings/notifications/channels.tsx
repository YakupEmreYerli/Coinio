import { useQueryClient } from '@tanstack/react-query';
import { AtSign, Bell, BellRing, CheckCircle2, Hash, Layers, Mail, MessageSquare, Pencil, Plus, Send, Smartphone, Webhook, XCircle, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { api, ApiError } from '../../../api';
import { Button } from '../../../components/ui/Button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '../../../components/ui/Dialog';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Switch } from '../../../components/ui/Switch';
import { Textarea } from '../../../components/ui/Textarea';
import { toast } from '../../../components/ui/Toaster';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { t } from '../../../i18n';
import { failureText } from '../../../lib/failure';
import { cn } from '../../../lib/cn';
import { keys } from '../../../lib/query';
import type { ApiChannel } from '../../../lib/types';
import { CHANNEL_FIELDS, CHANNEL_TYPES, type ChannelField, type ChannelType } from '../../../../shared/notify/types';
import { Section } from '../Section';

export const CHANNEL_ICONS: Record<ChannelType, LucideIcon> = {
  email: Mail, telegram: Send, discord: MessageSquare, slack: Hash, ntfy: Bell, gotify: BellRing, pushover: Smartphone, webhook: Webhook, apprise: Layers, account: AtSign,
};

export const channelLabel = (type: ChannelType) => t(`notify.type.${type}`);

/** The error text to show for a failed request: the service's own words when the server passed them on. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'demo_unavailable') return t('demo.locked');
    if (e.code === 'limit_reached') return failureText(e);
    if (e.detail) return e.detail;
    if (e.code === 'validation') return t('notify.invalid');
  }
  return t('error.generic');
}

type Draft = { type: ChannelType; name: string; enabled: boolean; values: Record<string, string> };

const emptyDraft = (type: ChannelType): Draft => ({
  type,
  name: channelLabel(type),
  enabled: true,
  values: Object.fromEntries(CHANNEL_FIELDS[type].map((f) => [f.key, !f.secret && f.default !== undefined ? String(f.default) : ''])),
});

const fromChannel = (c: ApiChannel): Draft => ({
  type: c.type,
  name: c.name,
  enabled: c.enabled,
  values: Object.fromEntries(CHANNEL_FIELDS[c.type].map((f) => [f.key, f.secret ? '' : String(c.config[f.key] ?? '')])),
});

function payload(d: Draft) {
  const config: Record<string, string> = {};
  const secrets: Record<string, string> = {};
  for (const f of CHANNEL_FIELDS[d.type]) (f.secret ? secrets : config)[f.key] = d.values[f.key] ?? '';
  return { type: d.type, name: d.name.trim(), enabled: d.enabled, config, secrets };
}

function FieldInput({ field, value, saved, onChange }: { field: ChannelField; value: string; saved: boolean; onChange: (v: string) => void }) {
  const label = t(`notify.field.${field.key}`) + (field.required ? '' : ` ${t('notify.optional')}`);
  const hintKey = `notify.hint.${field.key}`;
  const hint = t(hintKey) === hintKey ? undefined : t(hintKey);
  const placeholder = saved ? t('notify.secretSaved') : field.placeholder;
  if (field.kind === 'select') {
    return <Select label={label} value={value} onChange={onChange} options={(field.options ?? []).map((o) => ({ value: o, label: t(`notify.option.${o}`) === `notify.option.${o}` ? o : t(`notify.option.${o}`) }))} />;
  }
  if (field.kind === 'textarea') {
    const id = `nf-${field.key}`;
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-[13px] font-medium text-text-2">{label}</label>
        <Textarea id={id} rows={3} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="font-mono text-[12.5px]" spellCheck={false} />
        {hint && <p className="text-xs text-text-3">{hint}</p>}
      </div>
    );
  }
  return (
    <Input
      label={label}
      type={field.secret ? 'password' : field.kind === 'number' ? 'number' : field.kind === 'url' ? 'url' : 'text'}
      inputMode={field.kind === 'number' ? 'numeric' : undefined}
      autoComplete="off"
      spellCheck={false}
      value={value}
      placeholder={placeholder}
      hint={hint}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

type TestState = { ok: true } | { ok: false; message: string } | null;

function ChannelDialog({ open, onOpenChange, channel, accountMail }: { open: boolean; onOpenChange: (v: boolean) => void; channel: ApiChannel | null; accountMail: string | null }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(channel ? fromChannel(channel) : null);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [test, setTest] = useState<TestState>(null);
  const [confirm, setConfirm] = useState(false);
  const set = (patch: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setTest(null);
  };

  const save = async () => {
    if (!draft) return;
    setBusy('save');
    try {
      const body = payload(draft);
      if (channel) await api.patch(`/notifications/channels/${channel.id}`, { name: body.name, enabled: body.enabled, config: body.config, secrets: body.secrets });
      else await api.post('/notifications/channels', body);
      await qc.invalidateQueries({ queryKey: keys.notifications });
      toast.success(t('form.saved'));
      onOpenChange(false);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const sendTest = async () => {
    if (!draft) return;
    setBusy('test');
    try {
      await api.post('/notifications/channels/test', { ...payload(draft), ...(channel ? { id: channel.id } : {}) });
      setTest({ ok: true });
      void qc.invalidateQueries({ queryKey: keys.notificationLog });
    } catch (e) {
      setTest({ ok: false, message: errorText(e) });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!channel) return;
    try {
      await api.del(`/notifications/channels/${channel.id}`);
      await qc.invalidateQueries({ queryKey: keys.notifications });
      onOpenChange(false);
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={channel ? t('notify.editChannel') : draft ? t('notify.addChannelOf', { type: channelLabel(draft.type) }) : t('notify.addChannel')}
        description={!draft ? t('notify.pickType') : undefined}
        size="md"
      >
        {!draft ? (
          <DialogBody>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CHANNEL_TYPES.filter((type) => type !== 'account' || accountMail).map((type) => {
                const Icon = CHANNEL_ICONS[type];
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setDraft(emptyDraft(type))}
                    className="flex flex-col items-start gap-2 rounded-ctl border border-line-2 bg-card p-3 text-left hover:border-accent hover:bg-sunk focus-visible:border-accent focus-visible:outline-none"
                  >
                    <Icon className="size-5 text-accent" />
                    <span className="text-sm font-medium">{channelLabel(type)}</span>
                    <span className="text-[12px] leading-snug text-text-3">{t(`notify.typeDesc.${type}`)}</span>
                  </button>
                );
              })}
            </div>
          </DialogBody>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <DialogBody>
              <Input label={t('notify.channelName')} value={draft.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />
              {draft.type === 'account' && <p className="text-[13px] text-text-2">{t('notify.account.hint', { address: accountMail ?? '' })}</p>}
              {CHANNEL_FIELDS[draft.type].map((f) => (
                <FieldInput
                  key={f.key}
                  field={f}
                  value={draft.values[f.key] ?? ''}
                  saved={!!(f.secret && channel?.secrets[f.key])}
                  onChange={(v) => set({ values: { ...draft.values, [f.key]: v } })}
                />
              ))}
              <Switch checked={draft.enabled} onChange={(v) => set({ enabled: v })} label={t('notify.channelOn')} description={t('notify.channelOnHint')} />
              {test && (
                <div
                  role="status"
                  className={cn(
                    'flex items-start gap-2 rounded-ctl border px-3 py-2.5 text-[13px]',
                    test.ok ? 'border-pos/30 bg-pos/10 text-text' : 'border-neg/30 bg-neg/10 text-text',
                  )}
                >
                  {test.ok ? <CheckCircle2 className="mt-px size-4 shrink-0 text-pos" /> : <XCircle className="mt-px size-4 shrink-0 text-neg" />}
                  <span className="min-w-0 break-words">{test.ok ? t('notify.testSent') : <><b className="font-medium">{t('notify.testFailed')}</b> {test.message}</>}</span>
                </div>
              )}
            </DialogBody>
            <DialogFooter className="flex-wrap">
              {channel && (
                <Button variant="ghost" className="mr-auto text-neg hover:text-neg" onClick={() => setConfirm(true)}>
                  {t('common.delete')}
                </Button>
              )}
              <Button onClick={() => void sendTest()} disabled={busy !== null}>
                {busy === 'test' ? t('notify.sending') : t('notify.sendTest')}
              </Button>
              <Button type="submit" variant="primary" disabled={busy !== null || !draft.name.trim()}>
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('notify.deleteChannel', { name: channel?.name ?? '' })}
        body={t('notify.deleteChannelBody')}
        confirmLabel={t('common.delete')}
        onConfirm={() => void remove()}
      />
    </Dialog>
  );
}

export function ChannelsCard({ channels, accountMail = null }: { channels: ApiChannel[]; accountMail?: string | null }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ channel: ApiChannel | null; key: number } | null>(null);
  const toggle = async (c: ApiChannel, enabled: boolean) => {
    try {
      await api.patch(`/notifications/channels/${c.id}`, { enabled });
      await qc.invalidateQueries({ queryKey: keys.notifications });
    } catch (e) {
      toast.error(errorText(e));
    }
  };
  return (
    <Section
      id="channels"
      title={t('notify.channels')}
      description={t('notify.channelsDesc')}
      footer={
        <Button variant="primary" onClick={() => setEditing({ channel: null, key: Date.now() })}>
          <Plus />
          {t('notify.addChannel')}
        </Button>
      }
    >
      {channels.length === 0 ? (
        <p className="text-sm text-text-2">{t('notify.noChannels')}</p>
      ) : (
        <ul className="-my-1 flex flex-col divide-y divide-line">
          {channels.map((c) => {
            const Icon = CHANNEL_ICONS[c.type];
            return (
              <li key={c.id} className="flex items-center gap-3 py-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-ctl bg-sunk text-text-2">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <Switch checked={c.enabled} onChange={(v) => void toggle(c, v)} label={<span className="block truncate">{c.name}</span>} description={channelLabel(c.type)} />
                </div>
                <Button size="icon-sm" variant="ghost" aria-label={t('notify.editChannelNamed', { name: c.name })} onClick={() => setEditing({ channel: c, key: Date.now() })}>
                  <Pencil />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {editing && <ChannelDialog key={editing.key} open onOpenChange={(v) => !v && setEditing(null)} channel={editing.channel} accountMail={accountMail} />}
    </Section>
  );
}
