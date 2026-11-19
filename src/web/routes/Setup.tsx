import { api } from '../api';
import { t } from '../i18n';
import { AuthForm } from './AuthForm';

export const MIN_PASSWORD_LENGTH = 10;

export function Setup({ onDone }: { onDone: () => void }) {
  return (
    <AuthForm
      title={t('setup.title')}
      intro={t('setup.intro')}
      submitLabel={t('setup.submit')}
      passwordHint={t('setup.passwordHint', { min: MIN_PASSWORD_LENGTH })}
      newPassword
      onSubmit={async (username, password) => {
        await api.post('/auth/setup', { username, password });
        onDone();
      }}
      errorMessage={(e) => (e.status === 400 ? t('setup.error.invalid', { min: MIN_PASSWORD_LENGTH }) : t('error.generic'))}
    />
  );
}
