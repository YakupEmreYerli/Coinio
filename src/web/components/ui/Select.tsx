import { Select as S } from 'radix-ui';
import { Check, ChevronDown } from 'lucide-react';
import { useId } from 'react';
import { cn } from '../../lib/cn';

export type SelectOption = { value: string; label: string };

/** Single-choice dropdown; with `label` it renders its own label. */
export function Select({
  value,
  onChange,
  options,
  label,
  placeholder,
  className,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  label?: string;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}) {
  const id = useId();
  const select = (
    <S.Root value={value} onValueChange={onChange}>
      <S.Trigger
        id={id}
        aria-label={label ? undefined : ariaLabel}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-ctl border border-line-2 bg-card px-3 text-left text-sm outline-none focus-visible:border-accent data-[placeholder]:text-text-3',
          className,
        )}
      >
        <S.Value placeholder={placeholder} />
        <S.Icon>
          <ChevronDown className="size-4 text-text-3" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content position="popper" sideOffset={6} className="z-50 max-h-[320px] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-ctl border border-line bg-card text-text shadow-[var(--shadow)]">
          <S.Viewport className="p-1">
            {options.map((o) => (
              <S.Item key={o.value} value={o.value} className="relative flex h-9 cursor-default items-center rounded-[6px] pr-8 pl-2.5 text-[13.5px] outline-none select-none data-[highlighted]:bg-sunk">
                <S.ItemText>{o.label}</S.ItemText>
                <S.ItemIndicator className="absolute right-2.5">
                  <Check className="size-4 text-accent" />
                </S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
  if (!label) return select;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-text-2">
        {label}
      </label>
      {select}
    </div>
  );
}
