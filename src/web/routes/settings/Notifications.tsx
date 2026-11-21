import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../api';
import { toast } from '../../components/ui/Toaster';
import { t } from '../../i18n';
import { useNotifications, useSettings, useUpdateSettings } from '../../lib/hooks';
import { keys } from '../../lib/query';
import type { NotifySettings } from '../../lib/types';
import { ChannelsCard, errorText } from './notifications/channels';
import { RecentCard } from './notifications/recent';
import { AlertsCard, DigestsCard, RemindersCard } from './notifications/schedule';
import { TemplatesCard } from './notifications/templates';

export function Notifications() {
  const s = useSettings().data;
  const page = useNotifications().data;
  const qc = useQueryClient();
  const updateSettings = useUpdateSettings();
  const [draft, setDraft] = useState<NotifySettings | null>(null);
  const [time, setTime] = useState('09:00');
  const [saving, setSaving] = useState(false);
  useEffect(() => page && setDraft(page.settings), [page]);
  useEffect(() => s && setTime(s.reminderTime), [s]);
  if (!s || !page || !draft) return null;

  const dirty = JSON.stringify(draft) !== JSON.stringify(page.settings) || time !== s.reminderTime;
  const save = async () => {
    setSaving(true);
    try {
      if (time !== s.reminderTime) await updateSettings.mutateAsync({ reminderTime: time });
      const saved = await api.put<NotifySettings>('/notifications/settings', draft);
      qc.setQueryData(keys.notifications, { ...page, settings: saved });
      toast.success(t('form.saved'));
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const common = { value: draft, onChange: setDraft, onSave: () => void save(), saving, dirty };

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <ChannelsCard channels={page.channels} accountMail={page.accountMail ?? null} />
      <RemindersCard {...common} reminderTime={time} onTimeChange={setTime} />
      <DigestsCard {...common} />
      <AlertsCard {...common} base={s.baseCurrency} />
      <TemplatesCard page={page} base={s.baseCurrency} timezone={s.timezone} />
      <RecentCard timezone={s.timezone} />
    </div>
  );
}
