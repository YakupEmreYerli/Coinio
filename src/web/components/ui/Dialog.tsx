import { Dialog as D } from 'radix-ui';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { t } from '../../i18n';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

/** Centered modal with a title row; full screen under 640 px. */
export function DialogContent({
  title,
  description,
  children,
  className,
  size = 'md',
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const width = { sm: 'sm:max-w-[400px]', md: 'sm:max-w-[520px]', lg: 'sm:max-w-[720px]' }[size];
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-[var(--overlay)] backdrop-blur-[2px]" />
      <D.Content
        aria-describedby={description ? undefined : undefined}
        className={cn(
          'fixed z-50 flex flex-col bg-card text-text shadow-[var(--shadow)] outline-none',
          'inset-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[min(88vh,860px)] sm:w-[calc(100vw-32px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-card sm:border sm:border-line',
          width,
          className,
        )}
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <D.Title className="text-base font-medium">{title}</D.Title>
            {description ? (
              <D.Description className="mt-0.5 text-[13px] text-text-2">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{typeof title === 'string' ? title : ''}</D.Description>
            )}
          </div>
          <D.Close aria-label={t('common.close')} className="-mr-1 grid size-8 place-items-center rounded-ctl text-text-3 hover:bg-sunk hover:text-text">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

export function DialogBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('flex flex-col gap-4 px-5 py-5', className)}>{children}</div>;
}

export function DialogFooter({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('sticky bottom-0 flex justify-end gap-2 border-t border-line bg-card px-5 py-3.5', className)}>{children}</div>;
}
