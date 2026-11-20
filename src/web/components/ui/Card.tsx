import { createContext, useContext, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-card border border-line bg-card', className)} {...props} />;
}

const MenuSpace = createContext(false);
/** Set by a dashboard card frame: its "more" button sits in the top-right corner, so headers leave room for it. */
export const CardMenuSpace = MenuSpace.Provider;

/** Card title row: title on the left, optional actions on the right. */
export function CardHeader({ title, sub, actions, className }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; className?: string }) {
  const menuSpace = useContext(MenuSpace);
  return (
    <div className={cn('flex min-h-[54px] items-center gap-2.5 px-5 pt-4 pb-3', menuSpace && 'pr-12', className)}>
      <h2 className="text-[15px] font-medium">{title}</h2>
      {sub && <span className="text-[13px] text-text-3">{sub}</span>}
      {actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
    </div>
  );
}
