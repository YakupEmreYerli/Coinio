import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { toast } from '../../components/ui/Toaster';
import { t } from '../../i18n';
import { useSettings, useUpdateSettings } from '../../lib/hooks';
import { Section } from './Section';

export function Notifications() {
  const s = useSettings().data;
  const save = useUpdateSettings();
  const [token, setToken] = useState('');
  const [chat, setChat] = useState('');
  const [time, setTime] = useState('09:00');
  useEffect(() => {
    if (!s) return;
    setChat(s.telegramChatId ?? '');
    setTime(s.reminderTime);
  }, [s]);
  if (!s) return null;
  const test = async () => {
    try {
      await api.post('/settings/telegram/test');
      toast.success(t('notify.testSent'));
    } catch (e) {
      toast.error(e instanceof ApiError && e.code === 'not_configured' ? t('notify.notConfigured') : t('notify.testFailed'));
    }
  };
  return (
    <Section
      title={t('settings.notifications')}
      description={t('notify.desc')}
      footer={
        <>
          <Button onClick={test}>{t('notify.test')}</Button>
          <Button
            variant="primary"
            onClick={() =>
              save.mutate(
                { ...(token.trim() ? { telegramBotToken: token.trim() } : {}), telegramChatId: chat.trim() || null, reminderTime: time },
                { onSuccess: () => (setToken(''), toast.success(t('form.saved'))) },
              )
            }
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Input label={t('notify.token')} type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder={s.telegramBotToken ?? '123456:ABC…'} hint={t('notify.tokenHint')} />
      <Input label={t('notify.chat')} value={chat} onChange={(e) => setChat(e.target.value)} placeholder="-1001234567890" hint={t('notify.chatHint')} />
      <Input label={t('notify.time')} type="time" value={time} onChange={(e) => setTime(e.target.value)} hint={t('notify.timeHint')} className="w-40" />
    </Section>
  );
}
