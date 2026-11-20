import { api } from '../api';
import { getLocale, t } from '../i18n';
import { AuthForm } from './AuthForm';

export const MIN_PASSWORD_LENGTH = 10;

export function Setup({ onDone }: { onDone: () => void }) {
  return (
    <AuthForm
      title={t('setup.title')}
      intro={t('setup.intro')}
      submitLabel={t('setup.submit')}
      busyLabel={t('setup.busy')}
      newPassword={{ min: MIN_PASSWORD_LENGTH }}
      onSubmit={async (username, password) => {
        await api.post('/auth/setup', { username, password });
        // Keep the language the person is reading now; the server default would switch them to English.
        await api.patch('/settings', { locale: getLocale() }).catch(() => undefined);
        onDone();
      }}
      errorMessage={(e) => (e.status === 400 ? t('setup.error.invalid', { min: MIN_PASSWORD_LENGTH }) : t('error.generic'))}
    />
  );
}
