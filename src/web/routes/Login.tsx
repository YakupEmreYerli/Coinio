import { api } from '../api';
import { PasskeySignInButton } from '../components/PasskeySignInButton';
import { t } from '../i18n';
import { ext } from '@coinio/ext';
import { AuthForm } from './AuthForm';

const RESET_DOCS = 'https://docs.getcoinio.me/docs/reference/troubleshooting#i-forgot-my-password';

/** Only same-origin relative paths are followed; anything else falls back to the dashboard. */
/** Only same-site paths. Control characters are refused too: browsers drop them, so "/\t/x" would become "//x". */
export function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !/[\\\x00-\x1f\x7f]/.test(raw) ? raw : '/';
}

export function Login() {
  const next = safeNext(new URLSearchParams(location.search).get('next'));
  return (
    <AuthForm
      title={t('login.title')}
      intro={t('login.intro')}
      submitLabel={t('login.submit')}
      busyLabel={t('login.busy')}
      usernameAutoComplete="username webauthn"
      belowPassword={
        <a href={RESET_DOCS} target="_blank" rel="noreferrer" className="-mt-2 self-start text-[13px] text-text-2 underline-offset-4 hover:text-text hover:underline">
          {t('login.forgot')}
        </a>
      }
      after={
        <>
          <PasskeySignInButton next={next} showDivider />
          {ext.SignInExtras && <ext.SignInExtras />}
        </>
      }
      onSubmit={async (username, password) => {
        await api.post('/auth/login', { username, password });
        // Full load: the target may be a server-rendered page (/oauth/consent) and auth state must refresh.
        location.assign(next);
      }}
      errorMessage={(e) =>
        e.status === 429 ? t('login.error.tooMany') : e.status === 401 ? t('login.error.invalid') : t('error.generic')
      }
    />
  );
}
