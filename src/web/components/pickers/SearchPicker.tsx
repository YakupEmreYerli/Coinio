import { Command } from 'cmdk';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { Popover as P } from 'radix-ui';
import { useId, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type PickerItem = { value: string; label: string; sub?: string; meta?: ReactNode; leading?: ReactNode; keywords?: string[] };

/**
 * Searchable single choice: a field-like trigger that opens a filterable list (cmdk inside a popover).
 * `suggested` values are listed first under their own heading.
 */
export function SearchPicker({
  label,
  value,
  onChange,
  items,
  suggested = [],
  suggestedHeading,
  allHeading,
  searchPlaceholder,
  emptyText,
  renderValue,
  hint,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: PickerItem[];
  suggested?: string[];
  suggestedHeading?: string;
  allHeading?: string;
  searchPlaceholder: string;
  emptyText: string;
  renderValue?: (item: PickerItem | undefined) => ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const current = items.find((i) => i.value === value);
  const top = suggested.map((v) => items.find((i) => i.value === v)).filter((i): i is PickerItem => !!i);
  const rest = items.filter((i) => !suggested.includes(i.value));
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  const row = (item: PickerItem, group: string) => (
    <Command.Item
      key={`${group}-${item.value}`}
      value={`${group} ${item.value}`}
      keywords={[item.label, item.sub ?? '', ...(item.keywords ?? [])]}
      onSelect={() => pick(item.value)}
      className="flex min-h-10 cursor-default items-center gap-3 rounded-[8px] px-2.5 py-1.5 text-sm outline-none select-none data-[selected=true]:bg-sunk"
    >
      {item.leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{item.label}</span>
        {item.sub && <span className="block truncate text-xs text-text-3">{item.sub}</span>}
      </span>
      {item.meta && <span className="num shrink-0 text-xs text-text-3">{item.meta}</span>}
      <Check className={cn('size-4 shrink-0 text-accent', item.value === value ? 'opacity-100' : 'opacity-0')} aria-hidden />
    </Command.Item>
  );
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-text-2">
        {label}
      </label>
      <P.Root open={open} onOpenChange={setOpen}>
        <P.Trigger
          id={id}
          role="combobox"
          aria-expanded={open}
          className="flex h-11 w-full items-center gap-3 rounded-ctl border border-line-2 bg-card px-3 text-left text-sm text-text outline-none transition-[border-color,box-shadow] hover:border-text-3/40 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-soft data-[state=open]:border-accent data-[state=open]:ring-2 data-[state=open]:ring-accent-soft"
        >
          <span className="flex min-w-0 flex-1 items-center gap-3">{renderValue ? renderValue(current) : <span className="truncate">{current?.label ?? value}</span>}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-text-3" aria-hidden />
        </P.Trigger>
        <P.Portal>
          <P.Content
            align="start"
            sideOffset={6}
            collisionPadding={12}
            className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[280px] overflow-hidden rounded-card border border-line bg-card text-text shadow-[var(--shadow)] outline-none"
          >
            <Command label={label} loop>
              <div className="flex items-center gap-2 border-b border-line px-3">
                <Search className="size-4 shrink-0 text-text-3" aria-hidden />
                <Command.Input autoFocus placeholder={searchPlaceholder} className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-text-3 focus-visible:outline-none" />
              </div>
              <Command.List className="max-h-[min(50vh,320px)] overflow-y-auto overscroll-contain p-1.5 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-text-3 [&_[cmdk-group-heading]]:uppercase">
                <Command.Empty className="px-3 py-8 text-center text-sm text-text-3">{emptyText}</Command.Empty>
                {top.length > 0 && <Command.Group heading={suggestedHeading}>{top.map((i) => row(i, 's'))}</Command.Group>}
                <Command.Group heading={top.length > 0 ? allHeading : undefined}>{rest.map((i) => row(i, 'a'))}</Command.Group>
              </Command.List>
            </Command>
          </P.Content>
        </P.Portal>
      </P.Root>
      {hint && <p className="text-xs text-text-3">{hint}</p>}
    </div>
  );
}
