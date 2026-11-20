import { siIcloud, siNetflix, siSpotify } from 'simple-icons';
import type { ReactNode } from 'react';
import { SlicedMark } from '../brand/SlicedMark';
import { LOCALES, LOCALE_NAMES, getLocale, isLocale, setLocale, t, useLocale } from '../i18n';
import { Select } from '../components/ui/Select';
import { Wordmark } from '../layout/Wordmark';
import { cn } from '../lib/cn';
import { guessCurrency } from '../components/pickers/data';

const PREVIEW_PRICES: Record<string, [number, number, number]> = {
  TRY: [22999, 9999, 3999],
  USD: [1549, 1199, 299],
  EUR: [1399, 1099, 299],
  GBP: [1299, 1199, 299],
};

function BrandIcon({ path, hex }: { path: string; hex: string }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white shadow-[0_0_0_1px_rgb(255_255_255/0.08)]">
      <svg viewBox="0 0 24 24" className="size-[17px]" aria-hidden>
        <path d={path} fill={`#${hex}`} />
      </svg>
    </span>
  );
}

/** A still frame of the product: the next three renewals, in the visitor's language and likely currency. */
function PreviewCard() {
  const { locale } = useLocale();
  const currency = guessCurrency();
  const prices = PREVIEW_PRICES[currency] ?? PREVIEW_PRICES.USD!;
  const cur = PREVIEW_PRICES[currency] ? currency : 'USD';
  const money = (minor: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: cur }).format(minor / 100);
  const rows = [
    { icon: siNetflix, name: 'Netflix', due: t('auth.preview.in', { n: 3 }), amount: prices[0] },
    { icon: siSpotify, name: 'Spotify', due: t('auth.preview.in', { n: 9 }), amount: prices[1] },
    { icon: siIcloud, name: 'iCloud+', due: t('auth.preview.in', { n: 14 }), amount: prices[2] },
  ];
  const total = prices.reduce((a, b) => a + b, 0);
  return (
    <div className="w-full max-w-[360px] rounded-[16px] text-left border border-white/10 bg-[linear-gradient(180deg,rgb(18_20_30/0.92),rgb(10_11_17/0.94))] p-1.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.05),0_30px_80px_-30px_rgb(79_91_213/0.5)]" aria-hidden>
      <div className="flex items-baseline justify-between px-3.5 pt-3 pb-2.5">
        <span className="text-[12px] font-medium tracking-wide text-[#9a9fb4] uppercase">{t('auth.preview.title')}</span>
        <span className="num text-[13px] text-[#eceef6]">{money(total)}</span>
      </div>
      <ul className="rounded-[11px] border border-white/[0.06] bg-white/[0.02]">
        {rows.map((r, i) => (
          <li key={r.name} className={cn('flex items-center gap-3 px-3.5 py-2.5', i > 0 && 'border-t border-white/[0.05]')}>
            <BrandIcon path={r.icon.path} hex={r.icon.hex} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium text-[#f2f3f9]">{r.name}</span>
              <span className="block text-[12px] text-[#9a9fb4]">{r.due}</span>
            </span>
            <span className="num text-[13.5px] text-[#eceef6]">{money(r.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Dark brand half of the split screens: animated mark, value line, and either a product still or `children`. */
export function BrandPanel({ children }: { children?: ReactNode }) {
  return (
    <aside className="brand-surface hidden flex-col px-12 py-10 lg:flex xl:px-16">
      <div className="text-[#fafafa] [--accent:#8e96ff]">
        <Wordmark height={24} label={t('app.name')} />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-10 py-10 text-center">
        {children ?? (
          <>
            <div className="brand-rings size-[112px]">
              <span className="brand-halo" />
              <SlicedMark size={112} coin animated className="relative" />
            </div>
            <div className="max-w-[420px]">
              <h2 style={{ fontFamily: "'Plus Jakarta Sans Variable', var(--font-display)" }} className="text-[34px] leading-[1.12] font-bold tracking-[-0.022em] text-[#f4f5fb]">{t('auth.brand.headline')}</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-[#9a9fb4]">{t('auth.brand.lede')}</p>
            </div>
            <PreviewCard />
          </>
        )}
      </div>
      <p className="num text-[11.5px] tracking-[0.08em] text-[#646a80] uppercase">{t('auth.brand.footer')}</p>
    </aside>
  );
}

function LanguageSwitch() {
  const { locale } = useLocale();
  return (
    <Select
      aria-label={t('settings.language')}
      value={locale}
      onChange={(v) => isLocale(v) && setLocale(v)}
      options={LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l] }))}
      className="h-8 w-auto border-transparent bg-transparent px-2 text-[12.5px] text-text-2 hover:border-line-2"
    />
  );
}

/**
 * Split screen used by setup, sign-in and the first-run wizard: the dark brand panel on the left (desktop only)
 * and a focused column on the right. `header` sits above the column, `footer` under it.
 */
export function AuthLayout({ children, aside, header, wide = false, languageSwitch = true }: { children: ReactNode; aside?: ReactNode; header?: ReactNode; wide?: boolean; languageSwitch?: boolean }) {
  useLocale();
  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-[minmax(460px,44%)_1fr]">
      <BrandPanel>{aside}</BrandPanel>
      <main className="flex min-h-dvh flex-col px-5 py-6 sm:px-10 sm:py-8" lang={getLocale()}>
        <div className="flex min-h-9 items-center gap-3">
          <span className="text-text lg:hidden">
            <Wordmark height={22} label={t('app.name')} />
          </span>
          <div className="ml-auto flex items-center gap-2">{header}</div>
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className={cn('w-full', wide ? 'max-w-[480px]' : 'max-w-[380px]')}>{children}</div>
        </div>
        {languageSwitch && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-text-3">
            <LanguageSwitch />
            <span className="num">{typeof location !== 'undefined' ? location.host : ''}</span>
          </div>
        )}
      </main>
    </div>
  );
}
