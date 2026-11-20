import { cn } from '../../lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-ctl bg-sunk', className)} />;
}

/** List placeholder in the shape of a subscription row: logo, two text lines, amount. */
export function RowsSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div aria-hidden className={cn('divide-y divide-line', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-[var(--row)] items-center gap-3 px-5">
          <Skeleton className="size-[var(--logo)] shrink-0 rounded-[var(--logo-radius)]" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-[38%] max-w-[200px]" />
            <Skeleton className="h-2.5 w-[22%] max-w-[120px]" />
          </div>
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Card placeholder: a title line and a block of the given height. */
export function CardSkeleton({ height = 220, className }: { height?: number; className?: string }) {
  return (
    <div aria-hidden className={cn('rounded-card border border-line bg-card p-5', className)}>
      <Skeleton className="h-3.5 w-32" />
      <Skeleton className="mt-4 h-7 w-40" />
      <div className="mt-4 animate-pulse rounded-ctl bg-sunk" style={{ height: Math.max(height - 90, 24) }} />
    </div>
  );
}
