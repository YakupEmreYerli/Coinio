import { AlertCircle, Loader2 } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '../api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { t } from '../i18n';
import { AuthLayout } from '../onboarding/AuthLayout';
import { PasswordField } from '../onboarding/PasswordField';

export function FormError({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-ctl border border-neg/25 bg-neg-soft px-3 py-2.5 text-[13px] text-neg">
      <AlertCircle className="mt-px size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

/** Shared username + password form used by setup and sign-in, inside the split brand layout. */
export function AuthForm(props: {
  title: string;
  intro?: ReactNode;
  submitLabel: string;
  busyLabel?: string;
  /** New account: strength meter against this minimum and a confirmation field. */
  newPassword?: { min: number };
  onSubmit: (username: string, password: string) => Promise<void>;
  errorMessage: (e: ApiError) => string;
  belowPassword?: ReactNode;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (props.newPassword) {
      if (password.length < props.newPassword.min) return setError(t('auth.password.short', { min: props.newPassword.min }));
      if (password !== confirm) return setMismatch(true);
    }
    setBusy(true);
    try {
      await props.onSubmit(username.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? props.errorMessage(err) : t('error.generic'));
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <h1 className="font-display text-[28px] leading-[1.15] text-text">{props.title}</h1>
      {props.intro && <p className="mt-2 text-[14px] leading-relaxed text-text-2">{props.intro}</p>}
      <form onSubmit={submit} className="mt-8 flex flex-col gap-4" noValidate={false}>
        <Input
          label={t('common.username')}
          name="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          autoFocus
          className="h-11"
        />
        <PasswordField
          label={t('common.password')}
          name="password"
          value={password}
          onChange={(v) => {
            setPassword(v);
            setMismatch(false);
          }}
          autoComplete={props.newPassword ? 'new-password' : 'current-password'}
          min={props.newPassword?.min}
          meter={!!props.newPassword}
          hint={props.newPassword ? t('auth.password.hint', { min: props.newPassword.min }) : undefined}
        />
        {props.newPassword && (
          <PasswordField
            label={t('auth.password.confirm')}
            name="password-confirm"
            value={confirm}
            onChange={(v) => {
              setConfirm(v);
              setMismatch(false);
            }}
            autoComplete="new-password"
            error={mismatch ? t('auth.password.mismatch') : undefined}
          />
        )}
        {props.belowPassword}
        {error && <FormError>{error}</FormError>}
        <Button type="submit" variant="primary" disabled={busy} className="mt-2 h-11 w-full justify-center text-[14.5px]">
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          {busy ? (props.busyLabel ?? props.submitLabel) : props.submitLabel}
        </Button>
      </form>
    </AuthLayout>
  );
}
