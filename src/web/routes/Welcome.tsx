import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, FileInput, FlaskConical, Loader2, Plus } from 'lucide-react';
import { RadioGroup as R } from 'radix-ui';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { SlicedMark } from '../brand/SlicedMark';
import { browserZone, guessCurrency } from '../components/pickers/data';
import { CurrencyPicker, TimeZonePicker } from '../components/pickers/Pickers';
import { Button } from '../components/ui/Button';
import { LOCALES, LOCALE_NAMES, setLocale, t, useLocale, type Locale } from '../i18n';
import { useSettings } from '../lib/hooks';
import { cn } from '../lib/cn';
import { AuthLayout } from '../onboarding/AuthLayout';
import { FormError } from './AuthForm';
import { currencyFormat } from '../../shared/money';

export type OnboardingState = { completed: boolean; hasSamples: boolean };
export const useOnboarding = () => useQuery({ queryKey: ['onboarding'], queryFn: () => api.get<OnboardingState>('/onboarding') });

const STEPS = ['language', 'basics', 'start'] as const;

/** Left panel of the wizard: where you are and what is left. */
function Stepper({ step }: { step: number }) {
  return (
    <div className="flex w-full max-w-[380px] flex-col items-start text-left">
      <div className="brand-rings mb-12 size-14">
        <span className="brand-halo" />
        <SlicedMark size={56} coin animated className="relative" />
      </div>
      <p className="num mb-5 text-[11.5px] tracking-[0.12em] text-[#8e96ff] uppercase">{t('welcome.eyebrow')}</p>
      <ol className="flex w-full flex-col">
        {STEPS.map((id, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <li key={id} aria-current={current ? 'step' : undefined} className="relative flex gap-4 pb-7 last:pb-0">
              {i < STEPS.length - 1 && <span className={cn('absolute top-8 bottom-1 left-[13px] w-px', done ? 'bg-[#4f5bd5]' : 'bg-white/10')} aria-hidden />}
              <span
                className={cn(
                  'relative grid size-[27px] shrink-0 place-items-center rounded-full border text-[12px] font-semibold',
                  done && 'border-[#4f5bd5] bg-[#4f5bd5] text-white',
                  current && 'border-[#8e96ff] bg-[#4f5bd5]/15 text-[#e6e8ff] shadow-[0_0_0_4px_rgb(79_91_213/0.18)]',
                  !done && !current && 'border-white/15 text-[#646a80]',
                )}
              >
                {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span className="pt-0.5">
                <span className={cn('block text-[15px] font-medium', current || done ? 'text-[#f2f3f9]' : 'text-[#9a9fb4]')}>{t(`welcome.steps.${id}`)}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-[#7d8299]">{t(`welcome.steps.${id}Desc`)}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StepHeading({ step, title, intro }: { step: number; title: string; intro: string }) {
  return (
    <div>
      <div className="mb-6 flex items-center gap-3 lg:hidden" aria-hidden>
        <div className="grid flex-1 grid-cols-3 gap-1.5">
          {STEPS.map((id, i) => (
            <span key={id} className={cn('h-1 rounded-full', i <= step ? 'bg-accent' : 'bg-line')} />
          ))}
        </div>
      </div>
      <p className="mb-2 text-[12.5px] font-medium text-text-3">{t('welcome.step', { n: step + 1, total: STEPS.length })}</p>
      <h1 className="font-display text-[28px] leading-[1.15] text-text">{title}</h1>
      {/* Two lines reserved: the intro is one line in some languages and two in others, and the column is centred. */}
      <p className="mt-2 min-h-[3.25em] text-[14px] leading-relaxed text-text-2">{intro}</p>
    </div>
  );
}

function Choice({ icon, title, body, badge, busy, disabled, onClick }: { icon: ReactNode; title: string; body: string; badge?: string; busy?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex w-full items-center gap-4 rounded-card border border-line bg-card p-4 text-left transition-[border-color,box-shadow,background] hover:border-accent/60 hover:shadow-[0_0_0_3px_var(--accent-soft)] focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--accent-soft)] focus-visible:outline-none disabled:opacity-60"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-line bg-sunk text-text-2 transition-colors group-hover:border-accent/30 group-hover:bg-accent-soft group-hover:text-accent [&_svg]:size-[18px]">
        {busy ? <Loader2 className="animate-spin" /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <b className="font-medium text-text">{title}</b>
          {badge && <span className="rounded-full bg-accent-soft px-2 py-px text-[11px] font-medium text-accent">{badge}</span>}
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug text-text-2">{body}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-text-3 transition-transform group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
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
  const [choice, setChoice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cur = currency ?? (settings?.baseCurrency && settings.baseCurrency !== 'USD' ? settings.baseCurrency : guessCurrency());
  const tz = zone ?? browserZone();
  const firstField = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Each step starts with focus on its first control, so the whole wizard works from the keyboard.
    const root = firstField.current;
    (root?.querySelector<HTMLElement>('[role="radio"][data-state="checked"]') ?? root?.querySelector<HTMLElement>('button, [role="radio"], input'))?.focus();
  }, [step]);

  const finish = useMutation({
    mutationFn: async (then?: () => Promise<unknown>) => {
      if (then) await then();
      await api.post('/onboarding/complete');
    },
    onSuccess: async () => {
      await qc.invalidateQueries();
      onDone();
    },
    onError: () => {
      setChoice(null);
      setError(t('error.generic'));
    },
  });

  const saveBasics = useMutation({
    mutationFn: () => api.patch('/settings', { locale, baseCurrency: cur, timezone: tz }),
    onSuccess: () => {
      setError(null);
      setStep(2);
    },
    onError: () => setError(t('error.generic')),
  });

  const next = (e: FormEvent) => {
    e.preventDefault();
    if (step === 0) setStep(1);
    else if (step === 1) saveBasics.mutate();
  };

  const start = (id: string, then?: () => Promise<unknown>) => {
    setChoice(id);
    finish.mutate(then);
  };

  const sample = currencyFormat(cur, locale).format(1234.56);

  return (
    <AuthLayout
      wide
      languageSwitch={false}
      aside={<Stepper step={step} />}
      header={
        <Button variant="ghost" size="sm" onClick={() => finish.mutate(undefined)} disabled={finish.isPending}>
          {t('welcome.skip')}
        </Button>
      }
    >
      <form onSubmit={next} className="flex flex-col gap-7">
        {step === 0 && (
          <>
            <StepHeading step={0} title={t('welcome.title')} intro={t('welcome.intro')} />
            <div ref={firstField}>
              <R.Root aria-label={t('settings.language')} value={locale} onValueChange={(v) => setLocale(v as Locale)} className="grid auto-rows-fr grid-cols-2 gap-2.5">
                {LOCALES.map((l) => (
                  <R.Item
                    key={l}
                    value={l}
                    lang={l}
                    aria-label={LOCALE_NAMES[l]}
                    className="group relative flex flex-col items-start rounded-card border border-line bg-card px-4 py-3.5 text-left transition-[border-color,box-shadow] hover:border-line-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft data-[state=checked]:border-accent data-[state=checked]:shadow-[0_0_0_3px_var(--accent-soft)]"
                  >
                    <span className="line-clamp-2 min-h-[2lh] pr-7 text-[16px] font-medium text-text sm:min-h-0">{LOCALE_NAMES[l]}</span>
                    {/* Phones reserve two lines for each label: names wrap differently in each language and the tiles would jump. */}
                    <span className="line-clamp-2 min-h-[2lh] pr-7 text-[12.5px] text-text-3 sm:min-h-0" lang={locale}>{new Intl.DisplayNames(locale, { type: 'language' }).of(l === 'zh-CN' ? 'zh-Hans' : l)}</span>
                    <span className="absolute top-3.5 right-3.5 grid size-5 place-items-center rounded-full border border-line-2 group-data-[state=checked]:border-accent group-data-[state=checked]:bg-accent">
                      <R.Indicator>
                        <Check className="size-3 text-white" strokeWidth={3} />
                      </R.Indicator>
                    </span>
                  </R.Item>
                ))}
              </R.Root>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <StepHeading step={1} title={t('welcome.basicsTitle')} intro={t('welcome.basicsIntro')} />
            <div ref={firstField} className="flex flex-col gap-5">
              <CurrencyPicker value={cur} onChange={setCurrency} hint={t('welcome.currencyHint', { sample })} />
              <TimeZonePicker value={tz} onChange={setZone} hint={tz === browserZone() ? t('welcome.zoneHint') : t('welcome.zoneHintManual')} />
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <StepHeading step={2} title={t('welcome.startTitle')} intro={t('welcome.startIntro')} />
            <div ref={firstField} className="flex flex-col gap-2.5">
              <Choice
                icon={<FlaskConical />}
                title={t('welcome.samples')}
                body={t('welcome.samplesBody')}
                badge={t('welcome.recommended')}
                busy={choice === 'samples'}
                disabled={finish.isPending}
                onClick={() => start('samples', () => api.post('/onboarding/samples'))}
              />
              <Choice icon={<Plus />} title={t('welcome.empty')} body={t('welcome.emptyBody')} busy={choice === 'empty'} disabled={finish.isPending} onClick={() => start('empty')} />
              <Choice
                icon={<FileInput />}
                title={t('welcome.wallos')}
                body={t('welcome.wallosBody')}
                busy={choice === 'wallos'}
                disabled={finish.isPending}
                onClick={() => start('wallos', async () => navigate('/settings/import'))}
              />
            </div>
          </>
        )}
        {error && <FormError>{error}</FormError>}
        <div className={cn('flex items-center gap-3 border-t border-line pt-5', step === 0 ? 'justify-end' : 'justify-between')}>
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              <ArrowLeft />
              {t('welcome.back')}
            </Button>
          )}
          {step < 2 && (
            <Button type="submit" variant="primary" className="h-10 min-w-36 px-4" disabled={saveBasics.isPending}>
              {saveBasics.isPending && <Loader2 className="animate-spin" />}
              {t('welcome.continue')}
              {!saveBasics.isPending && <ArrowRight />}
            </Button>
          )}
          {step === 2 && <span className="text-[12.5px] text-text-3">{t('welcome.changeLater')}</span>}
        </div>
      </form>
    </AuthLayout>
  );
}

/** Thin notice on the dashboard while sample data is in use. */
export function SampleBanner() {
  const qc = useQueryClient();
  const state = useOnboarding().data;
  const clear = useMutation({ mutationFn: () => api.del('/onboarding/samples'), onSuccess: () => qc.invalidateQueries() });
  if (!state?.hasSamples) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-accent/30 bg-accent-soft px-4 py-2.5 text-sm">
      <FlaskConical className="size-4 text-accent" />
      <span className="flex-1 text-text">{t('welcome.bannerText')}</span>
      <Button size="sm" variant="secondary" onClick={() => clear.mutate()} disabled={clear.isPending}>
        {t('welcome.clearSamples')}
      </Button>
    </div>
  );
}
