import { currencyFormat, minorDigits } from '../../shared/money';
import { useLocale } from '../i18n';
import { useAppearanceValue } from '../lib/appearanceContext';
import { cn } from '../lib/cn';

type Cents = 'superscript' | 'inline' | 'hidden';
// xl and hero shrink with the nearest @container so a seven-digit amount never spills out of its card.
const sizes = { sm: 'text-[13px]', md: 'text-[15px]', lg: 'text-[18px]', xl: 'text-[min(26px,11cqw)]', hero: 'text-[min(48px,12cqw)] leading-[1.05]' } as const;

/** A money amount from minor units, in the viewer's locale; cents follow the appearance setting unless given. */
export function Money({
  minor,
  currency,
  approx,
  size = 'md',
  cents,
  className,
}: {
  minor: number;
  currency: string;
  approx?: boolean;
  size?: keyof typeof sizes;
  cents?: Cents;
  className?: string;
}) {
  const { locale } = useLocale();
  const setting = useAppearanceValue().cents;
  const mode = cents ?? setting;
  const parts = currencyFormat(currency, locale).formatToParts(minor / 10 ** minorDigits(currency));
  const fracIdx = parts.findIndex((p) => p.type === 'fraction');
  const decIdx = parts.findIndex((p) => p.type === 'decimal');
  const main = parts.filter((_, i) => i !== fracIdx && i !== decIdx).map((p) => p.value).join('');
  const frac = decIdx >= 0 && fracIdx >= 0 ? `${parts[decIdx]!.value}${parts[fracIdx]!.value}` : '';
  const big = size === 'hero' || size === 'xl';
  return (
    <span className={cn('whitespace-nowrap', big ? 'font-display' : 'num', sizes[size], className)}>
      {approx && '≈ '}
      {mode === 'inline' ? parts.map((p) => p.value).join('') : main}
      {mode === 'superscript' && frac && (
        <span data-cents className="ml-[0.04em] align-[0.82em] text-[0.52em] tracking-normal">
          {frac}
        </span>
      )}
    </span>
  );
}
