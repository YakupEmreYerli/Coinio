import { useState } from 'react';
import { api } from '../../api';
import { Button } from '../../components/ui/Button';
import { toast } from '../../components/ui/Toaster';
import { t } from '../../i18n';
import { useQueryClient } from '@tanstack/react-query';
import { Section } from './Section';

type Preview = { created: number; payments?: number; items: { name: string }[]; warnings: string[] };
type Source = { kind: 'coinio'; files: { name: string; text: string }[] } | { kind: 'wallos'; data: unknown };

export function Import() {
  const qc = useQueryClient();
  const [source, setSource] = useState<Source | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  // Coinio's own exports first (several files at once: subscriptions + payments); a single file Coinio does not
  // recognise is tried as a Wallos export.
  const send = (src: Source, dryRun: boolean) =>
    src.kind === 'coinio' ? api.post<Preview>('/import/coinio', { files: src.files, dryRun }) : api.post<Preview>('/import/wallos', { data: src.data, dryRun });
  const load = async (list: FileList | null) => {
    if (!list?.length) return;
    setError(null);
    setDone(null);
    setPreview(null);
    const files = await Promise.all([...list].slice(0, 5).map(async (f) => ({ name: f.name, text: await f.text() })));
    const attempts: Source[] = [{ kind: 'coinio', files }];
    if (files.length === 1) {
      try {
        attempts.push({ kind: 'wallos', data: JSON.parse(files[0]!.text) });
      } catch {
        // not JSON: only the Coinio CSV reader can take it
      }
    }
    for (const src of attempts) {
      try {
        setPreview(await send(src, true));
        setSource(src);
        return;
      } catch {
        // try the next reader
      }
    }
    setError(t('import.badFile'));
  };
  const run = async () => {
    if (!source) return;
    try {
      const r = await send(source, false);
      setDone(r.created);
      setPreview(null);
      await qc.invalidateQueries();
      toast.success(t('import.done', { n: r.created }));
    } catch {
      toast.error(t('error.generic'));
    }
  };
  return (
    <Section title={t('settings.import')} description={t('import.desc')}>
      <label className="flex cursor-pointer flex-col items-center gap-1 rounded-ctl border border-dashed border-line-2 px-4 py-6 text-center hover:border-accent">
        <span className="text-sm font-medium">{t('import.choose')}</span>
        <span className="text-xs text-text-3">{t('import.where')}</span>
        <input type="file" multiple accept="application/json,.json,text/csv,.csv" aria-label={t('import.file')} className="sr-only" onChange={(e) => void load(e.target.files)} />
      </label>
      {error && <p className="text-sm text-neg">{error}</p>}
      {done !== null && <p className="text-sm text-pos">{t('import.done', { n: done })}</p>}
      {preview && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-2">
            {t('import.found', { n: preview.items.length })}
            {!!preview.payments && <> {t('import.payments', { n: preview.payments })}</>}
          </p>
          <ul className="max-h-60 overflow-y-auto rounded-ctl border border-line">
            {preview.items.map((it, i) => (
              <li key={i} className="border-b border-line px-3 py-2 text-sm last:border-b-0">
                {it.name}
              </li>
            ))}
          </ul>
          {preview.warnings.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-ctl bg-sunk px-3 py-2.5 text-xs text-warn">
              {preview.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <Button variant="primary" className="self-end" disabled={preview.items.length === 0} onClick={run}>
            {t('import.run', { n: preview.items.length })}
          </Button>
        </div>
      )}
    </Section>
  );
}
