import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowUpRight, Check, Copy, Download, Smartphone } from 'lucide-react';
import { useMemo, useState } from 'react';
import { renderSVG } from 'uqr';
import widgetSource from '../../../../widget/coinio-widget.js?raw';
import { minorDigits } from '../../../shared/money';
import { widgetPayload } from '../../../shared/widget';
import { api } from '../../api';
import { Button } from '../../components/ui/Button';
import { toast } from '../../components/ui/Toaster';
import { t, useLocale } from '../../i18n';
import { useSummary } from '../../lib/hooks';
import { Section } from './Section';

/** The Scriptable script with this server's address and a key written in, ready to paste. */
export function fillWidgetScript(source: string, origin: string, key: string): string {
  const quote = (v: string) => `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  return source
    .replace(/^const SERVER_URL = .*$/m, `const SERVER_URL = ${quote(origin)};`)
    .replace(/^const API_KEY = .*$/m, `const API_KEY = ${quote(key)}; // read-only key made for this widget`);
}

/** True when a phone on mobile data probably cannot open this address (plain http, localhost, a private network). */
export function unreachableFromPhone(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return true;
  }
  const h = url.hostname;
  return (
    url.protocol !== 'https:' ||
    h === 'localhost' ||
    h.endsWith('.local') ||
    h.endsWith('.lan') ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    !h.includes('.')
  );
}

type Item = { name: string; dueDate: string; daysLeft: number; amountMinor: number; currency: string };

/** A rough picture of the Home Screen widget in three sizes, drawn from the user's own upcoming payments. */
function Preview() {
  const { locale } = useLocale();
  const summary = useSummary().data;
  const data = useMemo(() => (summary && Array.isArray(summary.upcoming) && Array.isArray(summary.overdue) ? widgetPayload<Item>(summary, new Date()) : null), [summary]);
  if (!data) return null;
  const money = (minor: number, currency: string) => {
    const d = minorDigits(currency);
    const digits = minor % 10 ** d === 0 ? 0 : d;
    return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(minor / 10 ** d);
  };
  const day = (iso: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  const widget = (size: 'small' | 'medium' | 'large') => {
    const count = size === 'small' ? 1 : size === 'medium' ? 4 : 8;
    return (
      <figure key={size} className="flex shrink-0 flex-col items-center gap-1.5">
        <div
          className={`flex flex-col gap-[3px] overflow-hidden rounded-[22px] bg-[#1c1c1e] p-3.5 text-white shadow-[0_8px_24px_-12px_rgb(0_0_0/0.5)] ${size === 'small' ? 'h-[150px] w-[150px]' : size === 'medium' ? 'h-[150px] w-[320px]' : 'h-[330px] w-[320px]'}`}
          aria-hidden
        >
          <span className="text-[10px] font-medium tracking-wide text-[#9ea3ff] uppercase">{t('conn.widgetLeft')}</span>
          <span className="num text-[21px] leading-tight font-bold">{money(data.leftThisMonthMinor, data.base)}</span>
          <span className="my-0.5 h-px shrink-0 bg-[#4f5bd5]" />
          {data.items.slice(0, count).map((it, i) => (
            <span key={i} className="flex min-w-0 items-baseline justify-between gap-2 text-[11.5px] leading-[15px]">
              <span className={`truncate font-semibold ${it.daysLeft < 0 ? 'text-[#e5484d]' : ''}`}>{it.name}</span>
              <span className="num shrink-0 text-[10.5px] text-white/70">
                {size !== 'small' && `${day(it.dueDate)} · `}
                {money(it.amountMinor, it.currency)}
              </span>
            </span>
          ))}
          {data.items.length === 0 && <span className="text-[11px] text-white/60">{t('conn.widgetNone')}</span>}
        </div>
        <figcaption className="text-[11.5px] text-text-3">{t(`conn.widgetSize.${size}`)}</figcaption>
      </figure>
    );
  };
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-medium text-text-2">{t('conn.widgetPreview')}</span>
      <div className="flex flex-wrap items-start gap-4">{(['small', 'medium', 'large'] as const).map(widget)}</div>
    </div>
  );
}

export function WidgetSetup({ origin }: { origin: string }) {
  const qc = useQueryClient();
  const [script, setScript] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const qr = useMemo(() => renderSVG(`${origin}/settings/integrations#widget`, { border: 1, pixelSize: 4 }), [origin]);

  const prepare = async () => {
    setBusy(true);
    try {
      const made = await api.post<{ key: string }>('/keys', { name: t('conn.widgetKeyName'), scope: 'read' });
      setScript(fillWidgetScript(widgetSource, origin, made.key));
      await qc.invalidateQueries({ queryKey: ['keys'] });
    } catch {
      toast.error(t('error.generic'));
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    if (!script) return;
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      toast.success(t('conn.widgetCopied'));
    } catch {
      toast.error(t('error.generic'));
    }
  };
  const download = () => {
    if (!script) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([script], { type: 'text/javascript' }));
    a.download = 'coinio-widget.js';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Section id="widget" title={t('conn.widgetTitle')} description={t('conn.widgetDesc')}>
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
      <div className="flex flex-col gap-5 md:flex-row md:items-start">
        <ol className="flex flex-1 flex-col gap-3">
          {[1, 2, 3, 4].map((n) => (
            <li key={n} className="flex gap-3 text-[13px] text-text-2">
              <span className="num grid size-5 shrink-0 place-items-center rounded-full bg-sunk text-[11px] font-medium text-text">{n}</span>
              <span className="flex flex-col gap-2 pt-px">
                <span>{t(`conn.widgetStep${n}`)}</span>
                {n === 2 &&
                  (script ? (
                    <span className="flex flex-col gap-2">
                      <span className="flex flex-wrap gap-2">
                        <Button variant="primary" onClick={copy}>
                          {copied ? <Check /> : <Copy />}
                          {t('conn.widgetCopy')}
                        </Button>
                        <Button onClick={download}>
                          <Download />
                          {t('conn.widgetDownload')}
                        </Button>
                      </span>
                      <span className="text-xs text-text-3">{t('conn.widgetKeyNote')}</span>
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
        <div className="hidden shrink-0 flex-col items-center gap-2 rounded-ctl border border-line p-3 md:flex">
          <span className="block size-[132px] rounded-[6px] bg-white p-1 [&_svg]:block [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} aria-hidden />
          <span className="flex max-w-[150px] items-center gap-1.5 text-center text-[11.5px] text-text-3">
            <Smartphone className="size-3.5 shrink-0" />
            {t('conn.widgetQr')}
          </span>
        </div>
      </div>
      <Preview />
      <a
        href="https://docs.getcoinio.me/docs/integrations/iphone-widget"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 self-start text-[13px] font-medium text-accent underline-offset-2 hover:underline"
      >
        {t('conn.widgetGuide')}
        <ArrowUpRight className="size-3.5" />
      </a>
    </Section>
  );
}
