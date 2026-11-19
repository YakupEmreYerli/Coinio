import { useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '../api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { t } from '../i18n';
import { Wordmark } from '../layout/Wordmark';

/** Shared username + password card used by setup and login. */
export function AuthForm(props: {
  title: string;
  intro?: string;
  submitLabel: string;
  passwordHint?: string;
  newPassword?: boolean;
  onSubmit: (username: string, password: string) => Promise<void>;
  errorMessage: (e: ApiError) => string;
  children?: ReactNode;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await props.onSubmit(username, password);
    } catch (err) {
      setError(err instanceof ApiError ? props.errorMessage(err) : t('error.generic'));
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-10">
      <div className="mb-7 flex items-center text-text">
        <Wordmark height={28} label={t('app.name')} />
      </div>
      <Card className="w-full max-w-[400px] p-7 shadow-[var(--shadow)]">
        <h1 className="font-display text-[26px] leading-tight">{props.title}</h1>
        {props.intro && <p className="mt-1.5 text-sm text-text-2">{props.intro}</p>}
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <Input
            label={t('common.username')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            autoFocus
          />
          <Input
            label={t('common.password')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={props.newPassword ? 'new-password' : 'current-password'}
            hint={props.passwordHint}
            required
          />
          {error && (
            <p role="alert" className="text-sm text-neg">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={busy} className="mt-1 w-full justify-center">
            {props.submitLabel}
          </Button>
        </form>
      </Card>
    </main>
  );
}
