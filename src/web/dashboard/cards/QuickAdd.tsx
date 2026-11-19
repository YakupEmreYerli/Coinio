import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api';
import { useLogoCandidates } from '../../components/logo-picker/LogoPicker';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { toast } from '../../components/ui/Toaster';
import { t, useLocale } from '../../i18n';
import { useSubscriptionForm } from '../../layout/subscriptionForm';
import { todayIn } from '../../lib/dates';
import { useSettings } from '../../lib/hooks';
import type { ApiSubscription, Cycle } from '../../lib/types';
import { parseAmount } from '../../subscription-form/amount';
import { CATEGORY_LABELS, searchCatalog } from '../../../shared/catalog';

const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

/** "spotify.com" → "Spotify"; plain text stays as typed. */
function nameFrom(text: string, brand: string | undefined): string {
  const v = text.trim();
  if (!DOMAIN_RE.test(v)) return v;
  if (brand) return brand;
  const labels = v.toLowerCase().split('.').filter((l) => l !== 'www');
  const main = labels.length >= 2 ? labels[labels.length - 2]! : labels[0]!;
  return main.charAt(0).toLocaleUpperCase('tr') + main.slice(1);
}

export function QuickAdd() {
  const { locale } = useLocale();
  const qc = useQueryClient();
  const form = useSubscriptionForm();
  const settings = useSettings().data;
  const [text, setText] = useState('');
  const [amount, setAmount] = useState('');
  const [cycle, setCycle] = useState<Cycle>('monthly');
  const [busy, setBusy] = useState(false);
  // A typed name that matches a catalog entry exactly brings its website and category along.
  const known = searchCatalog(text, 1).find((s) => s.name.toLocaleLowerCase('tr') === text.trim().toLocaleLowerCase('tr'));
  const isDomain = DOMAIN_RE.test(text.trim());
  const candidates = useLogoCandidates(isDomain ? '' : text, isDomain ? text : '').data?.candidates ?? [];
  const brand = candidates.find((c) => c.kind === 'brand')?.label;
  const name = known?.name ?? nameFrom(text, brand);
  const first = candidates[0];
  const amountMinor = parseAmount(amount, locale);

  const add = async () => {
    if (!name || amountMinor === null) return;
    setBusy(true);
    try {
      const created = await api.post<ApiSubscription>('/subscriptions', {
        name,
        domain: isDomain ? text.trim().toLowerCase() : (known?.domain ?? null),
        category: known ? CATEGORY_LABELS[known.category][locale] : null,
        amountMinor,
        currency: settings?.baseCurrency ?? 'TRY',
        cycle,
        intervalCount: 1,
        nextDue: todayIn(settings?.timezone ?? 'UTC'),
      });
      // Candidates may still be loading when the button is pressed; ask once more in that case.
      const pick =
        first ??
        (await api
          .get<{ candidates: { id: string }[] }>(`/logos/candidates?q=${encodeURIComponent(isDomain ? '' : name)}&domain=${encodeURIComponent(isDomain ? text.trim() : '')}`)
          .then((r) => r.candidates[0])
          .catch(() => undefined));
      if (pick) await api.post(`/subscriptions/${created.id}/logo/select`, { candidateId: pick.id, style: 'filled' }).catch(() => {});
      await qc.invalidateQueries();
      toast.success(t('form.created', { name }));
      setText('');
      setAmount('');
    } catch {
      toast.error(t('error.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title={t('quick.title')} />
      <form
        className="flex flex-col gap-2.5 px-5 pb-5"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input
          aria-label={t('quick.nameOrSite')}
          placeholder={t('quick.placeholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          leading={first ? <img src={first.previewUrl} alt="" className="size-[22px] rounded-full object-cover" /> : undefined}
          autoComplete="off"
        />
        <div className="grid grid-cols-2 gap-2.5">
          <Input aria-label={t('form.amount')} inputMode="decimal" placeholder={locale === 'tr' ? '99,99' : '99.99'} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Select
            aria-label={t('form.cycle')}
            value={cycle}
            onChange={(v) => setCycle(v as Cycle)}
            options={[
              { value: 'monthly', label: t('quick.monthly') },
              { value: 'yearly', label: t('quick.yearly') },
              { value: 'weekly', label: t('quick.weekly') },
            ]}
          />
        </div>
        <Button type="submit" variant="primary" className="w-full justify-center" disabled={busy || !name || amountMinor === null}>
          {name ? t('quick.addNamed', { name }) : t('quick.add')}
        </Button>
        <p className="text-xs text-text-3">
          {t('quick.hint')}{' '}
          <button type="button" className="text-accent underline-offset-2 hover:underline" onClick={() => form.openCreate({ name: name || undefined, domain: isDomain ? text.trim() : undefined, amountMinor: amountMinor ?? undefined, cycle })}>
            {t('quick.more')}
          </button>
        </p>
      </form>
    </Card>
  );
}
