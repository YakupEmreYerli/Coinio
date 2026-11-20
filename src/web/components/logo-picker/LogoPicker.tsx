import { useQuery } from '@tanstack/react-query';
import { ImageUp, Type } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { DEMO } from '../../demo/flag';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { useDebounced } from '../../lib/useDebounced';
import { Logo } from '../Logo';
import { SegmentedControl } from '../ui/SegmentedControl';

export type LogoCandidate = { id: string; kind: 'brand' | 'site' | 'ddg'; label: string; previewUrl: string; size: number | null; hex?: string };
export type LogoChoice =
  | { kind: 'keep' }
  | { kind: 'none' }
  | { kind: 'candidate'; candidateId: string; style?: 'filled' | 'plain' }
  | { kind: 'file'; file: File };

export const MAX_LOGO_BYTES = 512 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,.ico';

/** Fetches candidates for a name/domain (debounced). */
export function useLogoCandidates(name: string, domain: string | null | undefined) {
  const q = useDebounced(name.trim(), 300);
  const d = useDebounced((domain ?? '').trim().toLowerCase(), 300);
  return useQuery({
    queryKey: ['logo-candidates', q, d],
    queryFn: () => api.get<{ candidates: LogoCandidate[] }>(`/logos/candidates?q=${encodeURIComponent(q)}&domain=${encodeURIComponent(d)}`),
    // Two letters match dozens of unrelated brands; wait for a real word or a website.
    enabled: q.length >= 3 || d.length > 0,
    staleTime: 5 * 60_000,
  });
}

function Tile({ selected, onClick, label, children }: { selected: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      title={label}
      onClick={onClick}
      className={cn(
        'grid size-[52px] place-items-center rounded-[12px] border bg-card transition-shadow',
        selected ? 'border-accent shadow-[0_0_0_3px_var(--accent-soft)]' : 'border-line hover:border-line-2',
      )}
    >
      {children}
    </button>
  );
}

/** Logo chooser: brand icons, the site's own icons, DuckDuckGo, upload, or a letter badge. */
export function LogoPicker({
  name,
  domain,
  value,
  onChange,
  current,
}: {
  name: string;
  domain: string | null | undefined;
  value: LogoChoice;
  onChange: (c: LogoChoice) => void;
  current: { name: string; logoPath: string | null } | null;
}) {
  const { data, isFetching } = useLogoCandidates(name, domain);
  const [style, setStyle] = useState<'filled' | 'plain'>('filled');
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const candidates = (data?.candidates ?? []).filter((c) => !broken.has(c.id));
  const hasBrand = candidates.some((c) => c.kind === 'brand');

  useEffect(() => {
    if (value.kind !== 'file') return setFileUrl(null);
    const url = URL.createObjectURL(value.file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) return setError(t('logo.tooBig'));
    setError(null);
    onChange({ kind: 'file', file });
  };
  const isSel = (c: LogoCandidate) => value.kind === 'candidate' && value.candidateId === c.id;
  const preview = (c: LogoCandidate) => {
    if (c.kind !== 'brand') return c.previewUrl;
    const url = c.previewUrl.replace(/style=\w+/, `style=${style}`);
    // The demo serves both brand styles as static files instead of a query parameter.
    return DEMO ? url.replace(/\.svg\?style=plain$/, '-plain.svg') : url;
  };

  return (
    <div
      className="flex flex-col gap-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        pickFile(e.dataTransfer.files[0]);
      }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-medium text-text-2">{t('logo.title')}</span>
        {isFetching && <span className="text-xs text-text-3">{t('logo.searching')}</span>}
        {hasBrand && (
          <SegmentedControl
            className="ml-auto"
            label={t('logo.style')}
            value={style}
            onChange={(s) => {
              setStyle(s);
              if (value.kind === 'candidate' && value.candidateId.startsWith('brand:')) onChange({ ...value, style: s });
            }}
            options={[
              { value: 'filled', label: t('logo.filled') },
              { value: 'plain', label: t('logo.plain') },
            ]}
          />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {current?.logoPath && (
          <Tile selected={value.kind === 'keep'} onClick={() => onChange({ kind: 'keep' })} label={t('logo.current')}>
            <Logo sub={current} size={36} />
          </Tile>
        )}
        {candidates.map((c) => (
          <Tile key={c.id} selected={isSel(c)} label={c.label} onClick={() => onChange(c.kind === 'brand' ? { kind: 'candidate', candidateId: c.id, style } : { kind: 'candidate', candidateId: c.id })}>
            <img
              src={preview(c)}
              alt=""
              className="size-9 object-cover"
              style={{ borderRadius: 'var(--logo-radius)' }}
              onError={() => setBroken((b) => new Set(b).add(c.id))}
            />
          </Tile>
        ))}
        {fileUrl && (
          <Tile selected label={t('logo.uploaded')} onClick={() => {}}>
            <img src={fileUrl} alt="" className="size-9 object-cover" style={{ borderRadius: 'var(--logo-radius)' }} />
          </Tile>
        )}
        <Tile selected={value.kind === 'none'} onClick={() => onChange({ kind: 'none' })} label={t('logo.badge')}>
          {name.trim() ? <Logo sub={{ name, logoPath: null }} size={36} /> : <Type className="size-5 text-text-3" />}
        </Tile>
        {!DEMO && (
        <label className="grid size-[52px] cursor-pointer place-items-center rounded-[12px] border border-dashed border-line-2 text-text-3 hover:border-accent hover:text-accent" title={t('logo.upload')}>
          <ImageUp className="size-5" />
          <input ref={input} type="file" accept={ACCEPT} aria-label={t('logo.upload')} className="sr-only" onChange={(e) => pickFile(e.target.files?.[0])} />
        </label>
        )}
      </div>
      {error ? <p className="text-xs text-neg">{error}</p> : <p className="text-xs text-text-3">{t('logo.hint')}</p>}
    </div>
  );
}
