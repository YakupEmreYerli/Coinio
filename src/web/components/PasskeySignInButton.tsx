import { useQuery } from '@tanstack/react-query';
import { KeyRound, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { t } from '../i18n';
import { isPasskeyAutofillSupported, isPasskeySupported, isUserCancel, signInWithPasskey } from '../lib/passkeys';
import { Button } from './ui/Button';

export function PasskeySignInButton(props: {
  next?: string;
  onError?: (msg: string) => void;
  showDivider?: boolean;
  onSuccess?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const browserOk = isPasskeySupported();
  const { data } = useQuery({
    queryKey: ['passkey-status'],
    queryFn: () => api.get<{ supported: boolean }>('/auth/passkey/status'),
    staleTime: 60_000,
    enabled: browserOk,
  });
  const supported = browserOk && (data?.supported ?? false);

  useEffect(() => {
    if (!supported) return;
    let active = true;
    void isPasskeyAutofillSupported().then(async (ok) => {
      if (!active || !ok) return;
      try {
        await signInWithPasskey({ mediation: 'conditional' });
        if (!active) return;
        if (props.onSuccess) props.onSuccess();
        else location.assign(props.next ?? '/');
      } catch (err) {
        if (!active || isUserCancel(err)) return;
        const msg = err instanceof ApiError && err.status === 403 ? t('passkey.suspended') : t('passkey.failed');
        if (props.onError) props.onError(msg);
        else setError(msg);
      }
    });
    return () => {
      active = false;
    };
  }, [supported]);

  if (!supported) return null;

  const handleClick = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithPasskey();
      if (props.onSuccess) props.onSuccess();
      else location.assign(props.next ?? '/');
    } catch (err) {
      setBusy(false);
      if (isUserCancel(err)) return;
      const msg =
        err instanceof ApiError && err.status === 429
          ? t('login.error.tooMany')
          : err instanceof ApiError && err.status === 403
            ? t('cloud.err.suspended')
            : t('passkey.failed');
      if (props.onError) props.onError(msg);
      else setError(msg);
    }
  };

  return (
    <div className={props.showDivider ? 'mt-4 flex flex-col gap-3' : 'flex flex-col gap-3'}>
      {props.showDivider && (
        <div className="my-1 flex items-center gap-3 text-[12px] text-text-3">
          <span className="h-px flex-1 bg-line" />
          {t('passkey.or')}
          <span className="h-px flex-1 bg-line" />
        </div>
      )}
      <Button type="button" onClick={handleClick} disabled={busy} className="h-11 w-full justify-center text-[14.5px]">
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <KeyRound aria-hidden />}
        {busy ? t('passkey.signingIn') : t('passkey.signIn')}
      </Button>
      {error && !props.onError && (
        <p role="alert" className="text-[13px] text-neg">
          {error}
        </p>
      )}
    </div>
  );
}
