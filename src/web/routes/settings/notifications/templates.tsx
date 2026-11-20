import { useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Send } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../api';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { SegmentedControl } from '../../../components/ui/SegmentedControl';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { toast } from '../../../components/ui/Toaster';
import { formatMoney, t, useLocale } from '../../../i18n';
import { cycleLabel } from '../../../lib/cycle';
import { todayIn } from '../../../lib/dates';
import { keys } from '../../../lib/query';
import type { NotificationsPage, NotifyType } from '../../../lib/types';
import { renderTemplate, templateError } from '../../../../shared/notify/template';
import { NOTIFY_TYPES, TEMPLATE_VARIABLES } from '../../../../shared/notify/types';
import { sampleVars } from '../../../../shared/notify/vars';
import { Section } from '../Section';
import { errorText } from './channels';

type Field = 'title' | 'body';

export function TemplatesCard({ page, base, timezone }: { page: NotificationsPage; base: string; timezone: string }) {
  const qc = useQueryClient();
  const { locale } = useLocale();
  const [type, setType] = useState<NotifyType>('reminder');
  const saved = page.templates[type];
  const [title, setTitle] = useState(saved.title);
  const [body, setBody] = useState(saved.body);
  const [view, setView] = useState<'rich' | 'plain'>('rich');
  const [target, setTarget] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const last = useRef<Field>('body');
  const refs = { title: useRef<HTMLInputElement>(null), body: useRef<HTMLTextAreaElement>(null) };

  useEffect(() => {
    setTitle(saved.title);
    setBody(saved.body);
  }, [type, saved.title, saved.body]);

  const enabled = page.channels.filter((c) => c.enabled);
  const channelId = target || String(enabled[0]?.id ?? '');
  const dirty = title !== saved.title || body !== saved.body;
  const error = templateError(title) ?? templateError(body);

  const vars = useMemo(
    () =>
      sampleVars(type, { today: todayIn(timezone), base, appUrl: page.appUrl ?? location.origin, channel: enabled.find((c) => String(c.id) === channelId)?.name }, {
        locale,
        money: (minor, currency) => formatMoney(minor, currency, locale),
        cycle: (cycle, intervalCount) => cycleLabel({ cycle, intervalCount }),
      }),
    [type, timezone, base, page.appUrl, locale, channelId, enabled],
  );
  const preview = useMemo(() => {
    if (error) return null;
    return {
      title: renderTemplate(title, vars, 'text'),
      body: renderTemplate(body, vars, view === 'rich' ? 'html' : 'text').trim(),
    };
  }, [title, body, vars, view, error]);

  const insert = (name: string) => {
    const field = last.current;
    const el = refs[field].current;
    const token = `{{${name}}}`;
    const current = field === 'title' ? title : body;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    (field === 'title' ? setTitle : setBody)(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const refresh = () => qc.invalidateQueries({ queryKey: keys.notifications });
  const run = async (fn: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    try {
      await fn();
      if (success) toast.success(success);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section id="templates" title={t('notify.templates')} description={t('notify.templatesDesc')}>
      <Select label={t('notify.messageType')} value={type} onChange={(v) => setType(v as NotifyType)} className="sm:w-72" options={NOTIFY_TYPES.map((n) => ({ value: n, label: t(`notify.kind.${n}`) }))} />
      <Input
        ref={refs.title}
        label={t('notify.tplTitle')}
        value={title}
        maxLength={200}
        spellCheck={false}
        onFocus={() => (last.current = 'title')}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="tpl-body" className="text-[13px] font-medium text-text-2">{t('notify.tplBody')}</label>
        <Textarea
          ref={refs.body}
          id="tpl-body"
          rows={8}
          value={body}
          maxLength={5000}
          spellCheck={false}
          aria-invalid={!!error || undefined}
          onFocus={() => (last.current = 'body')}
          onChange={(e) => setBody(e.target.value)}
          className="font-mono text-[12.5px] leading-relaxed"
        />
        {error ? <p className="text-xs text-neg">{t('notify.tplInvalid', { tag: error.split(':')[1] ?? '' })}</p> : <p className="text-xs text-text-3">{t('notify.tplSyntax')}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-text-2">{t('notify.variables')}</span>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATE_VARIABLES[type].map((v) => (
            <button
              key={v}
              type="button"
              title={t(`notify.var.${v}`)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(v)}
              className="inline-flex h-7 items-center gap-1.5 rounded-[6px] border border-line-2 bg-sunk px-2 text-[12px] hover:border-accent hover:text-text"
            >
              <code className="font-mono text-accent">{`{{${v}}}`}</code>
              <span className="text-text-3 max-sm:hidden">{t(`notify.var.${v}`)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-medium text-text-2">{t('notify.preview')}</span>
          <SegmentedControl label={t('notify.preview')} value={view} onChange={setView} options={[{ value: 'rich', label: t('notify.previewRich') }, { value: 'plain', label: t('notify.previewPlain') }]} />
        </div>
        <div className="rounded-ctl border border-line bg-sunk p-4" aria-live="polite">
          {preview ? (
            <>
              <p className="mb-1.5 text-sm font-semibold break-words">{preview.title}</p>
              {view === 'rich' ? (
                // Safe: the template engine escapes the template text and every value for HTML.
                <div className="text-[13.5px] leading-relaxed break-words text-text-2 [&_a]:text-accent [&_a]:underline [&_b]:font-semibold [&_b]:text-text" dangerouslySetInnerHTML={{ __html: preview.body }} />
              ) : (
                <pre className="font-sans text-[13.5px] leading-relaxed break-words whitespace-pre-wrap text-text-2">{preview.body}</pre>
              )}
            </>
          ) : (
            <p className="text-[13px] text-text-3">{t('notify.previewUnavailable')}</p>
          )}
        </div>
        <p className="text-xs text-text-3">{t('notify.previewHint')}</p>
      </div>
      <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-end">
        {enabled.length > 0 ? (
          <div className="flex min-w-0 flex-1 items-end gap-2">
            <Select label={t('notify.sendTestTo')} className="min-w-0" value={channelId} onChange={setTarget} options={enabled.map((c) => ({ value: String(c.id), label: c.name }))} />
            <Button disabled={busy || !!error} onClick={() => void run(() => api.post(`/notifications/templates/${type}/test`, { channelId: Number(channelId), title, body }), t('notify.testSent'))}>
              <Send />
              {t('notify.send')}
            </Button>
          </div>
        ) : (
          <p className="flex-1 text-xs text-text-3">{t('notify.testNeedsChannel')}</p>
        )}
        <div className="flex gap-2 sm:ml-auto">
          <Button
            variant="ghost"
            disabled={busy || (!saved.custom && !dirty)}
            onClick={() =>
              void run(async () => {
                if (saved.custom) await api.del(`/notifications/templates/${type}`);
                setTitle(page.defaults[type].title);
                setBody(page.defaults[type].body);
                await refresh();
              }, t('notify.resetDone'))
            }
          >
            <RotateCcw />
            {t('notify.resetDefault')}
          </Button>
          <Button variant="primary" disabled={busy || !dirty || !!error} onClick={() => void run(async () => {
            await api.put(`/notifications/templates/${type}`, { title, body });
            await refresh();
          }, t('form.saved'))}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Section>
  );
}
