import { RadioGroup as R } from 'radix-ui';
import { cn } from '../../lib/cn';

/** Small pill switcher between a few values (radio semantics). */
export function SegmentedControl<V extends string>({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: V;
  onChange: (v: V) => void;
  options: { value: V; label: string }[];
  className?: string;
}) {
  return (
    <R.Root aria-label={label} value={value} onValueChange={(v) => onChange(v as V)} orientation="horizontal" className={cn('inline-flex rounded-[9px] bg-sunk p-0.5', className)}>
      {options.map((o) => (
        <R.Item
          key={o.value}
          value={o.value}
          className="h-7 rounded-[7px] px-2.5 text-[12.5px] font-medium text-text-2 data-[state=checked]:bg-card data-[state=checked]:text-text data-[state=checked]:shadow-[0_0_0_1px_var(--line-2)]"
        >
          {o.label}
        </R.Item>
      ))}
    </R.Root>
  );
}
