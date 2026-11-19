import { useState } from 'react';
import { api } from '../../api';
import { Button } from '../../components/ui/Button';
import { toast } from '../../components/ui/Toaster';
import { t } from '../../i18n';
import { useQueryClient } from '@tanstack/react-query';
import { Section } from './Section';

type Preview = { created: number; items: { name: string }[]; warnings: string[] };

export function Import() {
  const qc = useQueryClient();
  const [data, setData] = useState<unknown>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const load = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setDone(null);
    try {
      const json = JSON.parse(await file.text());
      setData(json);
      setPreview(await api.post<Preview>('/import/wallos', { data: json, dryRun: true }));
    } catch {
      setPreview(null);
      setError(t('import.badFile'));
    }
  };
  const run = async () => {
    try {
      const r = await api.post<Preview>('/import/wallos', { data, dryRun: false });
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
        <input type="file" accept="application/json,.json" aria-label={t('import.file')} className="sr-only" onChange={(e) => void load(e.target.files?.[0])} />
      </label>
      {error && <p className="text-sm text-neg">{error}</p>}
      {done !== null && <p className="text-sm text-pos">{t('import.done', { n: done })}</p>}
      {preview && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-2">{t('import.found', { n: preview.items.length })}</p>
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
