import { matchLocale, pickLocale } from '../../shared/locales';
import { DemoBackend, type LogoIndex } from './backend';

const base = import.meta.env.BASE_URL;

/** `?theme=dark|light` from the landing page picks Night or Paper. */
export function themeFromUrl(): 'night' | 'paper' | null {
  const v = new URLSearchParams(location.search).get('theme');
  return v === 'dark' || v === 'night' ? 'night' : v === 'light' || v === 'paper' ? 'paper' : null;
}

/** The one in-browser backend of the demo build; data lives in this tab's sessionStorage. */
export const demo = new DemoBackend({
  base,
  theme: themeFromUrl(),
  locale: matchLocale(new URLSearchParams(location.search).get('lang') ?? ''),
  defaultLocale: pickLocale(navigator.languages),
  defaultTheme: window.matchMedia('(prefers-color-scheme: light)').matches ? 'paper' : 'night',
  storage: (() => {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  })(),
  loadLogos: async () => {
    const res = await fetch(`${base}logos/index.json`);
    if (!res.ok) throw new Error(`logos ${res.status}`);
    return (await res.json()) as LogoIndex;
  },
});

