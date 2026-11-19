import { useEffect, useState } from 'react';
import { cn } from '../lib/cn';

const PALETTE = ['#2f5bd3', '#c2410c', '#0f766e', '#7c3aed', '#be185d', '#b45309', '#15803d', '#475569', '#0369a1', '#9f1239'];

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
