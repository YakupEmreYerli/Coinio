import { ArrowBigUpDash, Eye, EyeOff } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import { fieldClass } from '../components/ui/Input';
import { t } from '../i18n';
import { cn } from '../lib/cn';

/** 0 = empty, 1 = too short, 2 = ok, 3 = good, 4 = strong. Length matters most; variety adds a step. */
export function passwordStrength(pw: string, min: number): 0 | 1 | 2 | 3 | 4 {
  if (!pw) return 0;
  if (pw.length < min) return 1;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  let score = 2;
  if (pw.length >= min + 4 || kinds >= 3) score++;
  if (pw.length >= min + 8 && kinds >= 2) score++;
  return Math.min(score, 4) as 2 | 3 | 4;
}

/**
 * Password input with show/hide, a Caps Lock notice and, for new passwords, a strength meter against `min`.
 */
export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  min,
  name,
  error,
  meter = false,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: 'current-password' | 'new-password';
  min?: number;
  name?: string;
  error?: string;
  meter?: boolean;
  hint?: string;
}) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const [caps, setCaps] = useState(false);
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.('CapsLock') ?? false);
  const score = meter && min ? passwordStrength(value, min) : 0;
  const status = score === 0 ? (hint ?? null) : score === 1 ? t('auth.password.short', { min: min! }) : t(`auth.password.score${score}`);
  const describedBy = `${id}-status`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-text-2">
        {label}
      </label>
      <div className={cn(fieldClass, 'flex h-11 items-center gap-1 pr-1 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-soft', error && 'border-neg')}>
        <input
          id={id}
          name={name}
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKey}
          onKeyUp={onKey}
          onBlur={() => setCaps(false)}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          minLength={meter ? min : undefined}
          required
          aria-invalid={!!error || undefined}
          aria-describedby={describedBy}
          className="h-full min-w-0 flex-1 bg-transparent outline-none"
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? t('auth.password.hide') : t('auth.password.show')}
          aria-pressed={shown}
          className="grid size-8 shrink-0 place-items-center rounded-[7px] text-text-3 transition-colors hover:bg-sunk hover:text-text-2"
        >
          {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {meter && (
        <div className="grid grid-cols-4 gap-1 pt-0.5" aria-hidden>
          {[1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={cn(
                'h-1 rounded-full bg-line transition-colors',
                score >= i && (score === 1 ? 'bg-neg' : score === 2 ? 'bg-warn' : score === 3 ? 'bg-accent' : 'bg-pos'),
              )}
            />
          ))}
        </div>
      )}
      <div id={describedBy} aria-live="polite" className={cn("flex items-center justify-between gap-3 text-xs", (meter || hint) && "min-h-[18px]")}>
        {error ? <span className="text-neg">{error}</span> : <span className={cn(score === 1 ? 'text-text-2' : 'text-text-3')}>{status}</span>}
        {caps && (
          <span className="flex shrink-0 items-center gap-1 font-medium text-warn">
            <ArrowBigUpDash className="size-3.5" aria-hidden />
            {t('auth.password.caps')}
          </span>
        )}
      </div>
    </div>
  );
}
