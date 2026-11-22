import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowUpRight, Download, Smartphone } from 'lucide-react';
import { useMemo, useState } from 'react';
import { renderSVG } from 'uqr';
import { api } from '../../api';
import { Button } from '../../components/ui/Button';
import { toast } from '../../components/ui/Toaster';
import { t } from '../../i18n';
import { Section } from './Section';
import { unreachableFromPhone } from './WidgetSetup';

const RELEASES = 'https://github.com/yakupemreyerli/coinio/releases/latest';

/** The link the Android app reads from the QR code or a tap: this server's address and a read-only key. */
export function androidSetupLink(origin: string, key: string): string {
  return `coinio-widget://setup?url=${encodeURIComponent(origin)}&key=${encodeURIComponent(key)}`;
}

export function AndroidSetup({ origin }: { origin: string }) {
  const qc = useQueryClient();
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const qr = useMemo(() => (link ? renderSVG(link, { border: 1, pixelSize: 4 }) : null), [link]);

  const connect = async () => {
    setBusy(true);
    try {
      const made = await api.post<{ key: string }>('/keys', { name: t('conn.androidKeyName'), scope: 'read' });
      setLink(androidSetupLink(origin, made.key));
      await qc.invalidateQueries({ queryKey: ['keys'] });
    } catch {
      toast.error(t('error.generic'));
    } finally {
      setBusy(false);
    }
  };

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
      <div className="flex flex-col gap-5 md:flex-row md:items-start">
        <ol className="flex flex-1 flex-col gap-3">
          {[1, 2, 3].map((n) => (
            <li key={n} className="flex gap-3 text-[13px] text-text-2">
              <span className="num grid size-5 shrink-0 place-items-center rounded-full bg-sunk text-[11px] font-medium text-text">{n}</span>
              <span className="flex flex-col gap-2 pt-px">
                <span>{t(`conn.androidStep${n}`)}</span>
                {n === 1 && (
                  <Button asChild className="self-start">
                    <a href={RELEASES} target="_blank" rel="noreferrer">
                      <Download />
                      {t('conn.androidDownload')}
                    </a>
                  </Button>
                )}
                {n === 3 &&
                  (link ? (
                    <span className="flex flex-col gap-2">
                      <Button asChild className="self-start">
                        <a href={link}>
                          <Smartphone />
                          {t('conn.androidOpen')}
                        </a>
                      </Button>
                      <span className="text-xs text-text-3">{t('conn.androidKeyNote')}</span>
                    </span>
                  ) : (
                    <Button variant="primary" className="self-start" disabled={busy} onClick={connect}>
                      {t('conn.androidConnect')}
                    </Button>
                  ))}
              </span>
            </li>
          ))}
        </ol>
        {qr && (
          <div className="flex shrink-0 flex-col items-center gap-2 self-start rounded-ctl border border-line p-3">
            <span data-testid="android-qr" className="block size-[160px] rounded-[6px] bg-white p-1 [&_svg]:block [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} />
            <span className="max-w-[170px] text-center text-[11.5px] text-text-3">{t('conn.androidQr')}</span>
          </div>
        )}
      </div>
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
