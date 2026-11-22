import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowUpRight, Check, Copy, Download } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api';
import { Button } from '../../components/ui/Button';
import { toast } from '../../components/ui/Toaster';
import { t } from '../../i18n';
import { Section } from './Section';
import { unreachableFromPhone } from './WidgetSetup';

const HOSTED = 'https://app.getcoinio.me';
const SCRIPTWIDGET = 'https://github.com/everettjf/scriptwidget/releases';

/** The text that goes into the ScriptWidget widget's parameter: the key, plus the address on a self-hosted server. */
export function scriptWidgetParameter(origin: string, key: string): string {
  return origin === HOSTED ? key : `${origin} ${key}`;
}

/** Android widget through ScriptWidget, which runs Coinio's widget package from its gallery. */
export function AndroidSetup({ origin }: { origin: string }) {
  const qc = useQueryClient();
  const [param, setParam] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const hosted = origin === HOSTED;
  const host = (() => {
    try {
      return new URL(origin).host;
    } catch {
      return origin;
    }
  })();

  const prepare = async () => {
    setBusy(true);
    try {
      const made = await api.post<{ key: string }>('/keys', { name: t('conn.androidKeyName'), scope: 'read' });
      setParam(scriptWidgetParameter(origin, made.key));
      await qc.invalidateQueries({ queryKey: ['keys'] });
    } catch {
      toast.error(t('error.generic'));
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    if (!param) return;
    try {
      await navigator.clipboard.writeText(param);
      setCopied(true);
      toast.success(t('conn.androidCopied'));
    } catch {
      toast.error(t('error.generic'));
    }
  };

  const steps = [
    'conn.androidStep1',
    ...(hosted ? [] : ['conn.androidStepRemix']),
    'conn.androidStep2',
    'conn.androidStep3',
  ];

  return (
    <Section id="android" title={t('conn.androidTitle')} description={t('conn.androidDesc')}>
      {unreachableFromPhone(origin) && (
        <p role="alert" className="flex gap-2 rounded-ctl bg-warn/10 px-3 py-2.5 text-[13px] text-text-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>
            {t('conn.widgetUnreachable', { origin })}{' '}
            <a href="https://docs.getcoinio.me/docs/expose" target="_blank" rel="noreferrer" className="font-medium text-accent underline-offset-2 hover:underline">
              {t('conn.widgetExpose')}
            </a>
          </span>
        </p>
      )}
      <ol className="flex flex-col gap-3">
        {steps.map((key, i) => (
          <li key={key} className="flex gap-3 text-[13px] text-text-2">
            <span className="num grid size-5 shrink-0 place-items-center rounded-full bg-sunk text-[11px] font-medium text-text">{i + 1}</span>
            <span className="flex flex-col gap-2 pt-px">
              <span>
                {key === 'conn.androidStepRemix' ? (
                  <>
                    {t('conn.androidStepRemix')} <code className="rounded bg-sunk px-1 py-px text-[12px]">{host}</code>
                  </>
                ) : (
                  t(key)
                )}
              </span>
              {key === 'conn.androidStep1' && (
                <Button asChild className="self-start">
                  <a href={SCRIPTWIDGET} target="_blank" rel="noreferrer">
                    <Download />
                    {t('conn.androidDownload')}
                  </a>
                </Button>
              )}
              {key === 'conn.androidStep3' &&
                (param ? (
                  <span className="flex flex-col gap-2">
                    <Button variant="primary" className="self-start" onClick={copy}>
                      {copied ? <Check /> : <Copy />}
                      {t('conn.androidCopy')}
                    </Button>
                    <span className="text-xs text-text-3">{t('conn.androidKeyNote')}</span>
                  </span>
                ) : (
                  <Button variant="primary" className="self-start" disabled={busy} onClick={prepare}>
                    {t('conn.widgetPrepare')}
                  </Button>
                ))}
            </span>
          </li>
        ))}
      </ol>
      <a
        href="https://docs.getcoinio.me/docs/integrations/android-widget"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 self-start text-[13px] font-medium text-accent underline-offset-2 hover:underline"
      >
        {t('conn.androidGuide')}
        <ArrowUpRight className="size-3.5" />
      </a>
    </Section>
  );
}
