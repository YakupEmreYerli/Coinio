import { DEFAULT_APPEARANCE, mergeAppearance, type Stack } from '../../shared/appearance';
import type { Appearance } from './types';

const CACHE_KEY = 'coinio.appearance';
const STYLE_ID = 'st-custom-css';

/**
 * Puts the appearance on the root element: data attributes (theme, stack, density, logo shape) that
 * styles.css keys on, accent and radius variables, and the user's CSS last. "system" follows the OS
 * dark mode live; the returned function stops listening.
 */
export function applyAppearance(a: Appearance, root: HTMLElement = document.documentElement): () => void {
  let stop = () => {};
  if (a.theme === 'system') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const set = (dark: boolean) => (root.dataset.theme = dark ? 'night' : 'paper');
    set(mq.matches);
    const onChange = (e: { matches: boolean }) => set(e.matches);
    mq.addEventListener('change', onChange);
    stop = () => mq.removeEventListener('change', onChange);
  } else root.dataset.theme = a.theme;
  root.dataset.stack = a.stack;
  root.dataset.density = a.density;
  root.dataset.logo = a.logoShape;
  root.style.setProperty('--accent', a.accent);
  root.style.setProperty('--radius', `${a.radius}px`);

  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = a.customCss;
  void loadStackFonts(a.stack);
  return stop;
}

/** Fonts of the non-default stacks are downloaded only when chosen. */
export async function loadStackFonts(stack: Stack): Promise<void> {
  if (import.meta.env?.MODE === 'test') return;
  switch (stack) {
    case 'editorial':
      await Promise.all([import('@fontsource/instrument-serif'), import('@fontsource-variable/inter')]);
      break;
    case 'warm':
      await Promise.all([import('@fontsource-variable/fraunces'), import('@fontsource-variable/manrope')]);
      break;
    case 'technical':
      await Promise.all([import('@fontsource-variable/space-grotesk'), import('@fontsource/ibm-plex-mono/400.css'), import('@fontsource/ibm-plex-mono/500.css')]);
      break;
    case 'bold':
      await Promise.all([import('@fontsource-variable/bricolage-grotesque'), import('@fontsource-variable/inter')]);
      break;
    default:
  }
}

/** Last appearance seen, so the first paint after a reload already has the right theme. */
export function readCachedAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? mergeAppearance(JSON.parse(raw)) : DEFAULT_APPEARANCE;
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function cacheAppearance(a: Appearance): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(a));
  } catch {
    // private mode or blocked storage: the server copy still applies after load
  }
}
