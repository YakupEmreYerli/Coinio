import { Tooltip as T } from 'radix-ui';
import type { ReactNode } from 'react';

export const TooltipProvider = T.Provider;

export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <T.Root delayDuration={300}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content sideOffset={6} className="z-50 rounded-[6px] bg-primary px-2 py-1 text-xs text-primary-fg shadow-[var(--shadow)]">
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
