import { DropdownMenu as M } from 'radix-ui';
import { Check, ChevronRight } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/cn';

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;

export function DropdownMenuContent({ className, align = 'end', ...props }: ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={6}
        className={cn('z-50 min-w-[190px] rounded-ctl border border-line bg-card p-1 text-text shadow-[var(--shadow)]', className)}
        {...props}
      />
    </M.Portal>
  );
}

export function DropdownMenuItem({ className, danger, ...props }: ComponentProps<typeof M.Item> & { danger?: boolean }) {
  return (
    <M.Item
      className={cn(
        'flex h-9 cursor-default items-center gap-2.5 rounded-[6px] px-2.5 text-[13.5px] outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-sunk [&_svg]:size-4 [&_svg]:text-text-3',
        danger && 'text-neg [&_svg]:text-neg',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator() {
  return <M.Separator className="my-1 h-px bg-line" />;
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof M.Label>) {
  return <M.Label className={cn('px-2.5 py-1.5 text-xs text-text-3', className)} {...props} />;
}

export const DropdownMenuSub = M.Sub;
export const DropdownMenuRadioGroup = M.RadioGroup;

export function DropdownMenuSubTrigger({ className, children, ...props }: ComponentProps<typeof M.SubTrigger>) {
  return (
    <M.SubTrigger
      className={cn(
        'flex h-9 cursor-default items-center gap-2.5 rounded-[6px] px-2.5 text-[13.5px] outline-none select-none data-[highlighted]:bg-sunk data-[state=open]:bg-sunk [&_svg]:size-4 [&_svg]:text-text-3',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto" />
    </M.SubTrigger>
  );
}

export function DropdownMenuSubContent({ className, ...props }: ComponentProps<typeof M.SubContent>) {
  return (
    <M.Portal>
      <M.SubContent
        sideOffset={4}
        collisionPadding={8}
        className={cn('z-50 min-w-[180px] rounded-ctl border border-line bg-card p-1 text-text shadow-[var(--shadow)]', className)}
        {...props}
      />
    </M.Portal>
  );
}

export function DropdownMenuRadioItem({ className, children, ...props }: ComponentProps<typeof M.RadioItem>) {
  return (
    <M.RadioItem
      className={cn(
        'relative flex h-9 cursor-default items-center rounded-[6px] pr-8 pl-2.5 text-[13.5px] outline-none select-none data-[highlighted]:bg-sunk',
        className,
      )}
      {...props}
    >
      {children}
      <M.ItemIndicator className="absolute right-2.5">
        <Check className="size-4 text-accent" />
      </M.ItemIndicator>
    </M.RadioItem>
  );
}
