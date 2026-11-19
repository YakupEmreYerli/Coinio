import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FlaskConical, Sparkles } from 'lucide-react';
import { RadioGroup as R } from 'radix-ui';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { setLocale, t, useLocale, type Locale } from '../i18n';
import { Wordmark } from '../layout/Wordmark';
import { useSettings } from '../lib/hooks';

const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP', 'CHF', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK'];
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
/** Currency guess from the browser region: TR → TRY, euro countries → EUR, else USD. */
function guessCurrency(): string {
  const region = (navigator.language.split('-')[1] ?? '').toUpperCase();
  if (region === 'TR') return 'TRY';
  if (region === 'GB') return 'GBP';
  if (['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'IE', 'PT', 'FI', 'GR'].includes(region)) return 'EUR';
  return 'USD';
}

export type OnboardingState = { completed: boolean; hasSamples: boolean };
export const useOnboarding = () => useQuery({ queryKey: ['onboarding'], queryFn: () => api.get<OnboardingState>('/onboarding') });

function Choice({ icon, title, body, onClick }: { icon: ReactNode; title: string; body: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-start gap-4 rounded-card border border-line bg-card p-4 text-left transition-shadow hover:border-accent hover:shadow-[0_0_0_3px_var(--accent-soft)]">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent [&_svg]:size-5">{icon}</span>
      <span>
        <b className="block font-medium">{title}</b>
        <span className="text-[13px] text-text-2">{body}</span>
      </span>
    </button>
  );
}

/** First-run steps: language → currency and time zone → how to start. Skippable at any point. */
export function Welcome({ onDone, initialStep = 0 }: { onDone: () => void; initialStep?: number }) {
  const { locale } = useLocale();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const settings = useSettings().data;
  const [step, setStep] = useState(initialStep);
  const [currency, setCurrency] = useState<string | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const cur = currency ?? (settings?.baseCurrency && settings.baseCurrency !== 'TRY' ? settings.baseCurrency : guessCurrency());
  const tz = zone ?? browserZone();

  const finish = useMutation({
    mutationFn: async (then?: () => Promise<unknown>) => {
      if (then) await then();
      await api.post('/onboarding/complete');
    },
    onSuccess: async () => {
      await qc.invalidateQueries();
      onDone();
    },
  });

  const saveBasics = async () => {
    await api.patch('/settings', { locale, baseCurrency: cur, timezone: tz });
    setStep(2);
  };

  return (
    <main className="flex min-h-dvh flex-col items-center bg-bg px-4 py-10">
      <div className="flex w-full max-w-[560px] items-center gap-2.5 text-[15px] font-medium">
        <Wordmark height={26} label={t('app.name')} />
        <span className="ml-auto text-xs text-text-3">{t('welcome.step', { n: step + 1, total: 3 })}</span>
        <Button variant="ghost" size="sm" onClick={() => finish.mutate(undefined)}>
          {t('welcome.skip')}
        </Button>
      </div>
      <Card className="mt-8 w-full max-w-[560px] p-7 shadow-[var(--shadow)]">
        {step === 0 && (
          <div className="flex flex-col gap-5">
            <div>
              <h1 className="font-display text-[28px] leading-tight">{t('welcome.title')}</h1>
              <p className="mt-1.5 text-text-2">{t('welcome.intro')}</p>
            </div>
            <R.Root aria-label={t('settings.language')} value={locale} onValueChange={(v) => setLocale(v as Locale)} className="grid grid-cols-2 gap-2.5">
              {(['tr', 'en'] as const).map((l) => (
                <R.Item key={l} value={l} aria-label={l === 'tr' ? 'Türkçe' : 'English'} className="rounded-ctl border border-line p-3 text-left font-medium data-[state=checked]:border-accent data-[state=checked]:shadow-[0_0_0_3px_var(--accent-soft)]">
                  {l === 'tr' ? 'Türkçe' : 'English'}
                </R.Item>
              ))}
            </R.Root>
            <Button variant="primary" className="self-end" onClick={() => setStep(1)}>
              {t('welcome.continue')}
            </Button>
          </div>
        )}
        {step === 1 && (
          <div className="flex flex-col gap-5">
            <div>
              <h1 className="font-display text-[26px] leading-tight">{t('welcome.basicsTitle')}</h1>
              <p className="mt-1.5 text-text-2">{t('welcome.basicsIntro')}</p>
            </div>
            <Select label={t('settings.baseCurrency')} value={cur} onChange={setCurrency} options={[...new Set([cur, ...CURRENCIES])].map((c) => ({ value: c, label: c }))} />
            <Input label={t('settings.timezone')} value={tz} onChange={(e) => setZone(e.target.value)} hint={t('welcome.zoneHint')} />
            <div className="flex justify-between">
              <Button onClick={() => setStep(0)}>{t('welcome.back')}</Button>
              <Button variant="primary" onClick={() => void saveBasics()}>
                {t('welcome.continue')}
              </Button>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="font-display text-[26px] leading-tight">{t('welcome.startTitle')}</h1>
              <p className="mt-1.5 text-text-2">{t('welcome.startIntro')}</p>
            </div>
            <Choice icon={<Download />} title={t('welcome.wallos')} body={t('welcome.wallosBody')} onClick={() => finish.mutate(async () => navigate('/settings/import'))} />
            <Choice icon={<FlaskConical />} title={t('welcome.samples')} body={t('welcome.samplesBody')} onClick={() => finish.mutate(() => api.post('/onboarding/samples'))} />
            <Choice icon={<Sparkles />} title={t('welcome.empty')} body={t('welcome.emptyBody')} onClick={() => finish.mutate(undefined)} />
          </div>
        )}
      </Card>
    </main>
  );
}

/** Thin notice on the dashboard while sample data is in use. */
export function SampleBanner() {
  const qc = useQueryClient();
  const state = useOnboarding().data;
  const clear = useMutation({ mutationFn: () => api.del('/onboarding/samples'), onSuccess: () => qc.invalidateQueries() });
  if (!state?.hasSamples) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-accent bg-accent-soft px-4 py-2.5 text-sm">
      <FlaskConical className="size-4 text-accent" />
      <span className="flex-1">{t('welcome.bannerText')}</span>
      <Button size="sm" variant="primary" onClick={() => clear.mutate()}>
        {t('welcome.clearSamples')}
      </Button>
    </div>
  );
}
