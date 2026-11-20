import { Download, RotateCcw, Upload } from 'lucide-react';
import { RadioGroup as R } from 'radix-ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_APPEARANCE, STACKS, THEMES, forImport, mergeAppearance, type Stack, type Theme } from '../../../shared/appearance';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Switch } from '../../components/ui/Switch';
import { t, useLocale } from '../../i18n';
import { SAFE_MODE, loadStackFonts } from '../../lib/appearance';
import { useAppearanceEditor } from '../../lib/appearanceEditor';
import { useCategoryColor } from '../../lib/categoryColor';
import { cn } from '../../lib/cn';
import { useSettings, useSubscriptions } from '../../lib/hooks';
import type { Appearance as AppearanceData } from '../../lib/types';
import { CardLayout } from './appearance/CardLayout';
import { CssEditor } from './appearance/CssEditor';
import { HtmlCards } from './appearance/HtmlCards';
import { currencyFormat } from '../../../shared/money';

/** A titled settings block with its own "back to default" button. */
function Block({ title, description, onReset, children }: { title: string; description?: string; onReset?: () => void; children: ReactNode }) {
  return (
    <Card>
      <section>
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-medium">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] text-text-2">{description}</p>}
          </div>
          {onReset && (
            <Button size="sm" variant="ghost" onClick={onReset}>
              <RotateCcw />
              {t('look.reset')}
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-4 px-5 py-5">{children}</div>
      </section>
    </Card>
  );
}

const THEME_SWATCH: Record<Theme, [string, string, string]> = {
  paper: ['#f8f8fb', '#ffffff', '#16172b'],
  white: ['#ffffff', '#fafafa', '#1d1d27'],
  night: ['#0f1117', '#151821', '#eceef4'],
  black: ['#000000', '#0c0c0d', '#f2f2f3'],
  system: ['#f8f8fb', '#0f1117', '#8b8ea3'],
};
const STACK_FONTS: Record<Stack, [string, string]> = {
  rafine: ["'Plus Jakarta Sans Variable'", "'Geist Variable'"],
  editorial: ["'Instrument Serif'", "'Inter Variable'"],
  warm: ["'Fraunces Variable'", "'Manrope Variable'"],
  technical: ["'Space Grotesk Variable'", "'IBM Plex Mono'"],
  bold: ["'Bricolage Grotesque Variable'", "'Inter Variable'"],
  system: ['system-ui', 'system-ui'],
};
const ACCENTS = ['#4f5bd5', '#ea6a12', '#18794e', '#b4366b', '#0f766e', '#1d1d27'];

const tileClass =
  'flex flex-col gap-2 rounded-[12px] border border-line bg-card p-2.5 text-left outline-none data-[state=checked]:border-accent data-[state=checked]:shadow-[0_0_0_3px_var(--accent-soft)] focus-visible:border-accent';

/** The type preview's amount (2,217.99) in the user's currency and locale, split into whole part and cents. */
export function sampleAmount(currency: string, locale: string): [string, string] {
  const parts = currencyFormat(currency, locale).formatToParts(2217.99);
  const frac = parts.findIndex((p) => p.type === 'fraction');
  const dec = parts.findIndex((p) => p.type === 'decimal');
  const whole = parts.filter((_, i) => i !== frac && i !== dec).map((p) => p.value).join('').trim();
  return [whole, dec >= 0 && frac >= 0 ? `${parts[dec]!.value}${parts[frac]!.value}` : ''];
}

export function Appearance() {
  const { locale } = useLocale();
  const { appearance: a, update } = useAppearanceEditor();
  const subs = useSubscriptions().data ?? [];
  const colorOf = useCategoryColor();
  const categories = [...new Set(subs.map((s) => s.category).filter(Boolean))] as string[];
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [pendingTheme, setPendingTheme] = useState<AppearanceData | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Previews show every stack in its own type.
    STACKS.forEach((s) => void loadStackFonts(s));
  }, []);
  const d = DEFAULT_APPEARANCE;
  const sample = sampleAmount(useSettings().data?.baseCurrency ?? 'USD', locale);

  const exportTheme = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(a, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'coinio-theme.json';
    link.click();
    URL.revokeObjectURL(url);
  };
  const importTheme = async (file: File | undefined) => {
    if (!file) return;
    setImportError(null);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      setPendingTheme(forImport(mergeAppearance(parsed)));
    } catch {
      setImportError(t('look.importError'));
    }
    if (fileInput.current) fileInput.current.value = '';
  };

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      {SAFE_MODE && <p className="rounded-card border border-line bg-accent-soft px-5 py-3 text-sm">{t('look.safeMode')}</p>}
      <Block title={t('look.theme')} onReset={() => update({ theme: d.theme })}>
        <R.Root aria-label={t('look.theme')} value={a.theme} onValueChange={(v) => update({ theme: v as Theme })} className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          {THEMES.map((th) => {
            const [bg, card, fg] = THEME_SWATCH[th];
            return (
              <R.Item key={th} value={th} aria-label={t(`look.theme.${th}`)} className={tileClass}>
                <span className="relative block h-14 overflow-hidden rounded-[8px] border border-line" style={{ background: bg }}>
                  <span className="absolute top-2 left-2 h-2 w-8 rounded-full" style={{ background: fg, opacity: 0.8 }} />
                  <span className="absolute right-2 bottom-2 left-2 h-5 rounded-[5px]" style={{ background: th === 'system' ? `linear-gradient(90deg, #ffffff 50%, ${card} 50%)` : card }} />
                  <span className="absolute top-2 right-2 size-2 rounded-full" style={{ background: a.accent }} />
                </span>
                <span className="text-[13px] font-medium">{t(`look.theme.${th}`)}</span>
              </R.Item>
            );
          })}
        </R.Root>
      </Block>

      <Block title={t('look.accent')} description={t('look.accentDesc')} onReset={() => update({ accent: d.accent })}>
        <div className="flex flex-wrap items-center gap-2.5">
          {ACCENTS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              aria-pressed={a.accent.toLowerCase() === c}
              onClick={() => update({ accent: c })}
              className={cn('size-8 rounded-full ring-offset-2 ring-offset-[var(--card)]', a.accent.toLowerCase() === c && 'ring-2 ring-[var(--text)]')}
              style={{ background: c }}
            />
          ))}
          <label className="flex items-center gap-2 text-[13px] text-text-2">
            <input type="color" value={a.accent} onChange={(e) => update({ accent: e.target.value })} aria-label={t('look.customColor')} className="size-8 cursor-pointer rounded-full border-0 bg-transparent p-0" />
            {t('look.customColor')}
          </label>
        </div>
      </Block>

      <Block title={t('look.type')} description={t('look.typeDesc')} onReset={() => update({ stack: d.stack })}>
        <R.Root aria-label={t('look.type')} value={a.stack} onValueChange={(v) => update({ stack: v as Stack })} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {STACKS.map((s) => (
            <R.Item key={s} value={s} aria-label={t(`look.stack.${s}`)} className={tileClass}>
              <span className="text-[13px] font-medium">{t(`look.stack.${s}`)}</span>
              <span className="text-[30px] leading-none" style={{ fontFamily: STACK_FONTS[s][0] }}>
                {sample[0]}
                <sup className="text-[0.5em]">{sample[1]}</sup>
              </span>
              <span className="text-xs text-text-3" style={{ fontFamily: STACK_FONTS[s][1] }}>
                {t(`look.stackDesc.${s}`)}
              </span>
            </R.Item>
          ))}
        </R.Root>
      </Block>

      <Block title={t('look.layout')} onReset={() => update({ density: d.density, radius: d.radius, logoShape: d.logoShape, cents: d.cents, showForeign: d.showForeign })}>
        <Row label={t('look.density')}>
          <SegmentedControl label={t('look.density')} value={a.density} onChange={(v) => update({ density: v })} options={[{ value: 'comfy', label: t('look.comfy') }, { value: 'compact', label: t('look.compact') }]} />
        </Row>
        <Row label={t('look.radius')}>
          <input type="range" min={0} max={20} value={a.radius} aria-label={t('look.radius')} onChange={(e) => update({ radius: Number(e.target.value) })} className="w-40 accent-[var(--accent)]" />
        </Row>
        <Row label={t('look.logoShape')}>
          <SegmentedControl label={t('look.logoShape')} value={a.logoShape} onChange={(v) => update({ logoShape: v })} options={[{ value: 'circle', label: t('look.circle') }, { value: 'rounded', label: t('look.rounded') }]} />
        </Row>
        <Row label={t('look.cents')}>
          <SegmentedControl
            label={t('look.cents')}
            value={a.cents}
            onChange={(v) => update({ cents: v })}
            options={[
              { value: 'superscript', label: t('look.centsSup') },
              { value: 'inline', label: t('look.centsInline') },
              { value: 'hidden', label: t('look.centsHidden') },
            ]}
          />
        </Row>
        <Switch checked={a.showForeign} onChange={(v) => update({ showForeign: v })} label={t('look.showForeign')} description={t('look.showForeignDesc')} />
      </Block>

      {categories.length > 0 && (
        <Block title={t('look.categoryColors')} onReset={() => update({ categoryColors: {} })}>
          <div className="grid gap-2 sm:grid-cols-2">
            {categories.map((c) => (
              <label key={c} className="flex items-center gap-3 rounded-ctl border border-line px-3 py-2 text-sm">
                <input
                  type="color"
                  value={toHex(colorOf(c))}
                  aria-label={t('look.colorFor', { name: c })}
                  onChange={(e) => update((cur) => ({ ...cur, categoryColors: { ...cur.categoryColors, [c]: e.target.value } }))}
                  className="size-7 cursor-pointer rounded-full border-0 bg-transparent p-0"
                />
                <span className="truncate">{c}</span>
              </label>
            ))}
          </div>
        </Block>
      )}

      <Block title={t('look.cards')} description={t('look.cardsDesc')} onReset={() => update((cur) => mergeAppearance({ ...cur, cards: [] }))}>
        <CardLayout appearance={a} onChange={(cards) => update({ cards })} />
      </Block>

      <Block title={t('look.html')} description={t('look.htmlDesc')}>
        <HtmlCards appearance={a} update={update} />
      </Block>

      <Block title={t('look.css')} description={t('look.cssDesc')} onReset={() => update({ customCss: '' })}>
        <CssEditor value={a.customCss} onChange={(customCss) => update({ customCss })} />
        <p className="text-xs text-text-3">{t('look.cssEscape')}</p>
      </Block>

      <Block title={t('look.share')} description={t('look.shareDesc')}>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportTheme}>
            <Download />
            {t('look.export')}
          </Button>
          <label className="inline-flex h-[38px] cursor-pointer items-center gap-2 rounded-ctl border border-line-2 bg-card px-3.5 text-sm font-medium hover:bg-sunk">
            <Upload className="size-4" />
            {t('look.import')}
            <input ref={fileInput} type="file" accept="application/json,.json" aria-label={t('look.importFile')} className="sr-only" onChange={(e) => void importTheme(e.target.files?.[0])} />
          </label>
          <Button variant="ghost" className="ml-auto text-neg hover:text-neg" onClick={() => setConfirmAll(true)}>
            <RotateCcw />
            {t('look.resetAll')}
          </Button>
        </div>
        {importError && <p className="text-sm text-neg">{importError}</p>}
      </Block>

      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title={t('look.resetAllTitle')}
        body={t('look.resetAllBody')}
        confirmLabel={t('look.resetAll')}
        onConfirm={() => update(DEFAULT_APPEARANCE as AppearanceData)}
      />
      <ConfirmDialog
        open={!!pendingTheme}
        onOpenChange={(v) => !v && setPendingTheme(null)}
        title={t('look.importTitle')}
        body={importSummary(pendingTheme)}
        confirmLabel={t('look.import')}
        danger={hasCode(pendingTheme)}
        onConfirm={() => pendingTheme && update(pendingTheme)}
      />
    </div>
  );
}

const hasCode = (theme: AppearanceData | null) => !!theme && (theme.customCss.trim() !== '' || theme.htmlCards.length > 0);

/** What loading a theme file replaces, and a warning when it brings its own CSS or HTML. */
function importSummary(theme: AppearanceData | null): string {
  if (!theme) return '';
  const body = t('look.importBody');
  return hasCode(theme) ? `${body} ${t('look.importCode', { n: theme.htmlCards.length })}` : body;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}

/** Colour inputs need #rrggbb; CSS variables fall back to a neutral grey. */
function toHex(c: string): string {
  return /^#[0-9a-f]{6}$/i.test(c) ? c : '#8e8d96';
}
