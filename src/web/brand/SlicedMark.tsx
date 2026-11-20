import { cn } from '../lib/cn';

/** The seven month slices of the Coinio C (same geometry as the wordmark and the app icon). */
export const SLICES = [
  'M45.93 16.96A20.5 20.5 0 0 0 35.68 11.83',
  'M33.41 11.55A20.5 20.5 0 0 0 22.21 13.99',
  'M20.27 15.19A20.5 20.5 0 0 0 13.08 24.11',
  'M12.32 26.27A20.5 20.5 0 0 0 12.32 37.73',
  'M13.08 39.89A20.5 20.5 0 0 0 20.27 48.81',
  'M22.21 50.01A20.5 20.5 0 0 0 33.41 52.45',
  'M35.68 52.17A20.5 20.5 0 0 0 45.93 47.04',
];

/**
 * The sliced C mark. `coin` adds the coin of the app icon; `animated` plays the landing-site intro
 * (slices arrive one month at a time, then a light runs round the dial). Colours come from
 * `--mark-slice`, `--mark-lit` and `--mark-coin`, so the mark follows the surface it sits on.
 */
export function SlicedMark({ size = 64, coin = false, animated = false, className, label }: { size?: number; coin?: boolean; animated?: boolean; className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('brand-mark overflow-visible', animated && 'is-animated', className)}
    >
      <g className="brand-mark-slices" fill="none" strokeWidth="9">
        {SLICES.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      {animated && (
        <g className="brand-mark-lit" fill="none" strokeWidth="9">
          {SLICES.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      )}
      {coin && <circle className="brand-mark-coin" cx="46.5" cy="32" r="7" />}
    </svg>
  );
}
