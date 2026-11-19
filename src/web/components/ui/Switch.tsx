import { Switch as S } from 'radix-ui';
import { useId, type ReactNode } from 'react';

/** Toggle with an inline label and optional description. */
export function Switch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {description && <p className="mt-0.5 text-[12.5px] text-text-3">{description}</p>}
      </div>
      <S.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className="relative h-6 w-10 shrink-0 rounded-full bg-line-2 transition-colors data-[state=checked]:bg-accent"
      >
        <S.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
      </S.Root>
    </div>
  );
}
