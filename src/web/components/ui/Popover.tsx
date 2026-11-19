import { Popover as P } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/cn';

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;

export function PopoverContent({ className, align = 'start', ...props }: ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        sideOffset={6}
        className={cn('z-50 rounded-ctl border border-line bg-card p-3 text-text shadow-[var(--shadow)] outline-none', className)}
        {...props}
      />
    </P.Portal>
  );
}
