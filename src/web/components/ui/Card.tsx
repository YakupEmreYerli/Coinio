import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-card border border-line bg-card', className)} {...props} />;
}

/** Card title row: title on the left, optional actions on the right. */
export function CardHeader({ title, sub, actions, className }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-[54px] items-center gap-2.5 px-5 pt-4 pb-3', className)}>
      <h2 className="text-[15px] font-medium">{title}</h2>
      {sub && <span className="text-[13px] text-text-3">{sub}</span>}
      {actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
    </div>
  );
}
