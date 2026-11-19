import { useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { useEffect } from 'react';
import { t, useLocale } from '../i18n';
import { keys } from '../lib/query';

/** Floating "Live demo · Reset" pill; also follows theme changes sent by the landing page. */
export function DemoBar() {
  const qc = useQueryClient();
  useLocale(); // follow the app's language
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin) return;
      const data = e.data as { type?: string; theme?: string } | null;
      if (data?.type !== 'coinio:theme' || (data.theme !== 'night' && data.theme !== 'paper')) return;
      const theme = data.theme;
      void import('.').then(({ demo }) => demo.setTheme(theme)).then(() => qc.invalidateQueries({ queryKey: keys.appearance }));
    };
    // Inside the landing page, Esc (when no dialog of the app is open) closes the enlarged demo there.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && window.parent !== window && !document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) {
        window.parent.postMessage({ type: 'coinio:escape' }, location.origin);
      }
    };
    window.addEventListener('message', onMessage);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [qc]);
  return (
    <div className="fixed right-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-40 flex items-center gap-1 rounded-full border border-line-2 bg-card/90 py-1 pr-1 pl-3 text-[12.5px] text-text-2 shadow-[var(--shadow)] backdrop-blur md:right-auto md:bottom-[108px] md:left-4 md:w-[216px]">
      <span className="relative mr-1 flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-pos opacity-50" />
        <span className="relative inline-flex size-2 rounded-full bg-pos" />
      </span>
      <span className="font-medium text-text">{t('demo.live')}</span>
      <span className="mx-1 h-4 w-px bg-line-2 md:ml-auto" />
      <button
        type="button"
        aria-label={t('demo.resetLabel')}
        title={t('demo.resetLabel')}
        onClick={() =>
          void import('.').then(({ demo }) => {
            demo.reset();
            location.assign(`${import.meta.env.BASE_URL}?theme=${document.documentElement.dataset.theme === 'paper' ? 'light' : 'dark'}`);
          })
        }
        className="flex h-7 items-center gap-1.5 rounded-full px-2.5 hover:bg-sunk hover:text-text"
      >
        <RotateCcw className="size-3.5" />
        {t('demo.reset')}
      </button>
    </div>
  );
}

/** Wraps a settings page that needs the real server: a short note and every control disabled. */
export function DemoLocked({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p role="note" className="rounded-ctl border border-line-2 bg-sunk px-4 py-3 text-[13px] text-text-2">
        {t('demo.locked')}
      </p>
      <fieldset disabled className="m-0 min-w-0 border-0 p-0 opacity-60">
        {children}
      </fieldset>
    </div>
  );
}
