import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { api, ApiError } from '../../api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { toast } from '../../components/ui/Toaster';
import { t } from '../../i18n';
import { useUser } from '../../lib/user';
import { PasskeysSection } from './PasskeysSection';
import { Section } from './Section';

export function Account() {
  const { username } = useUser();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    try {
      await api.post('/auth/password', { current, next });
      setCurrent('');
      setNext('');
      toast.success(t('account.changed'));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? t('account.wrong') : e instanceof ApiError && e.status === 400 ? t('account.tooShort') : t('error.generic'));
    }
  };
  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <Section
        title={t('account.password')}
        description={username ? t('account.signedInAs', { name: username }) : undefined}
        footer={
          <Button variant="primary" disabled={!current || next.length < 10} onClick={submit}>
            {t('account.change')}
          </Button>
        }
      >
        <Input label={t('account.current')} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <Input label={t('account.new')} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} hint={t('setup.passwordHint', { min: 10 })} error={error ?? undefined} />
        <p className="text-xs text-text-3">{t('account.othersOut')}</p>
      </Section>
      <PasskeysSection />
      <Section title={t('account.session')}>
        <Button
          className="self-start"
          onClick={async () => {
            await api.post('/auth/logout');
            location.assign('/login');
          }}
        >
          <LogOut />
          {t('common.logout')}
        </Button>
      </Section>
    </div>
  );
}
