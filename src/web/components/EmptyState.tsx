import type { ReactNode } from 'react';
import { SlicedMark } from '../brand/SlicedMark';
import { cn } from '../lib/cn';

/**
 * Empty and first-use states. `brand` puts the sliced C on a faint grid (the landing site's ground) for the
 * moments that introduce the product; everyday "nothing matches" states keep a small neutral icon.
 */
export function EmptyState({ icon, title, body, action, brand = false, className }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode; brand?: boolean; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center px-6 text-center', brand ? 'brand-ground py-14' : 'gap-2 py-10', className)}>
      {brand ? (
        <div className="brand-rings mb-6 size-14 [--mark-slice:var(--accent)]">
          <SlicedMark size={56} coin className="relative [--mark-coin:color-mix(in_oklab,var(--accent)_70%,white)]" />
        </div>
      ) : (
        icon && <div className="mb-1 grid size-10 place-items-center rounded-full border border-line bg-sunk text-text-3 [&_svg]:size-[18px]">{icon}</div>
      )}
      <p className={cn(brand ? 'font-display text-[19px] leading-snug text-text' : 'font-medium text-text')}>{title}</p>
      {body && <p className={cn('max-w-[340px] text-text-3', brand ? 'mt-1.5 text-[13.5px] leading-relaxed text-text-2' : 'text-[13px]')}>{body}</p>}
      {action && <div className={cn('flex flex-wrap items-center justify-center gap-2', brand ? 'mt-6' : 'mt-2')}>{action}</div>}
    </div>
  );
}
