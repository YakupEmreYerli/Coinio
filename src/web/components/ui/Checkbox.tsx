import { Checkbox as C } from 'radix-ui';
import { Check, Minus } from 'lucide-react';

export function Checkbox({ checked, onChange, 'aria-label': ariaLabel }: { checked: boolean | 'indeterminate'; onChange: (v: boolean) => void; 'aria-label': string }) {
  return (
    <C.Root
      checked={checked}
      onCheckedChange={(v) => onChange(v === true)}
      aria-label={ariaLabel}
      className="grid size-[18px] shrink-0 place-items-center rounded-[5px] border border-line-2 bg-card data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent"
    >
      <C.Indicator className="text-white">{checked === 'indeterminate' ? <Minus className="size-3" /> : <Check className="size-3" strokeWidth={3} />}</C.Indicator>
    </C.Root>
  );
}
