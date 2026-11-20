import { useEffect, useState } from 'react';
import { cn } from '../lib/cn';

// The category palette's hues at a lower lightness (OKLCH L 0.52), so a white letter keeps at least 5:1 contrast.
const PALETTE = ['#525dbd', '#007979', '#8d5e00', '#a4435f', '#27709c', '#7e539c', '#397949', '#a54a28', '#676f2d', '#60697b'];

/** Stable badge colour derived from the name. */
export function monogramColor(name: string): string {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

/** Subscription logo; falls back to a coloured first-letter badge when there is no image or it fails to load. */
export function Logo({ sub, size, className }: { sub: { name: string; logoPath: string | null }; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [sub.logoPath]);
  const style = { ...(size ? { '--logo': `${size}px` } : {}), width: 'var(--logo)', height: 'var(--logo)', borderRadius: 'var(--logo-radius)' } as React.CSSProperties;
  const base = 'grid shrink-0 place-items-center overflow-hidden bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.07),0_1px_3px_rgb(0_0_0/0.08)]';
  if (sub.logoPath && !broken) {
    return (
      <span className={cn(base, className)} style={style}>
        {/* Logo tiles are always light; keeps self-theming SVG favicons from turning white in dark mode. */}
        <img src={`${import.meta.env.BASE_URL}logos/${sub.logoPath}`} alt="" className="size-full object-cover" style={{ colorScheme: 'light' }} onError={() => setBroken(true)} />
      </span>
    );
  }
  const letter = Array.from(sub.name.trim())[0]?.toLocaleUpperCase('tr') ?? '?';
  return (
    <span className={cn(base, 'font-semibold text-white', className)} style={{ ...style, background: monogramColor(sub.name), fontSize: 'calc(var(--logo) * 0.42)' }} aria-hidden>
      {letter}
    </span>
  );
}
