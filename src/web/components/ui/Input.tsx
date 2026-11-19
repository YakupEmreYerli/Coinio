import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export const fieldClass =
  'h-10 w-full rounded-ctl border border-line-2 bg-card px-3 text-sm text-text placeholder:text-text-3 outline-none focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft disabled:opacity-60 aria-invalid:border-neg';

type Props = InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; error?: string; leading?: ReactNode };

/** Text input; with `label` it renders its own label, hint and error line. */
export const Input = forwardRef<HTMLInputElement, Props>(function Input({ label, hint, error, leading, className, id, ...props }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const input = leading ? (
    <div className={cn(fieldClass, 'flex items-center gap-2 px-3 focus-within:border-accent', className)}>
      <span className="text-text-3">{leading}</span>
      <input ref={ref} id={inputId} aria-invalid={!!error || undefined} className="h-full min-w-0 flex-1 bg-transparent outline-none" {...props} />
    </div>
  ) : (
    <input ref={ref} id={inputId} aria-invalid={!!error || undefined} className={cn(fieldClass, className)} {...props} />
  );
  if (!label) return input;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-[13px] font-medium text-text-2">
        {label}
      </label>
      {input}
      {error ? <p className="text-xs text-neg">{error}</p> : hint ? <p className="text-xs text-text-3">{hint}</p> : null}
    </div>
  );
});
