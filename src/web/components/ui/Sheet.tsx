import { Dialog as D } from 'radix-ui';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { t } from '../../i18n';

export const Sheet = D.Root;

/** Panel sliding in from the right (from the bottom, full width, under 640 px). */
export function SheetContent({ title, children, className, actions }: { title: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-[var(--overlay)]" />
      <D.Content
        className={cn(
          'fixed z-50 flex flex-col bg-card text-text shadow-[var(--shadow)] outline-none',
          'inset-x-0 bottom-0 max-h-[92vh] rounded-t-card border-t border-line sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[460px] sm:rounded-none sm:border-t-0 sm:border-l',
          className,
        )}
      >
        <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          <D.Title className="min-w-0 flex-1 truncate text-base font-medium">{title}</D.Title>
          <D.Description className="sr-only">{typeof title === 'string' ? title : ''}</D.Description>
          {actions}
          <D.Close aria-label={t('common.close')} className="grid size-8 place-items-center rounded-ctl text-text-3 hover:bg-sunk hover:text-text">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
