import { api } from '../api';
import { t } from '../i18n';
import { AuthForm } from './AuthForm';

/** Only same-origin relative paths are followed; anything else falls back to the dashboard. */
export function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\') ? raw : '/';
}

export function Login() {
  return (
    <AuthForm
      title={t('login.title')}
      submitLabel={t('login.submit')}
      onSubmit={async (username, password) => {
        await api.post('/auth/login', { username, password });
        // Full load: the target may be a server-rendered page (/oauth/consent) and auth state must refresh.
        location.assign(safeNext(new URLSearchParams(location.search).get('next')));
      }}
      errorMessage={(e) =>
        e.status === 429 ? t('login.error.tooMany') : e.status === 401 ? t('login.error.invalid') : t('error.generic')
      }
    />
  );
}
