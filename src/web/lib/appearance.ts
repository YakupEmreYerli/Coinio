import { DEFAULT_APPEARANCE, mergeAppearance, type Stack } from '../../shared/appearance';
import type { Appearance } from './types';

const CACHE_KEY = 'coinio.appearance';
const STYLE_ID = 'st-custom-css';
const VARS_ID = 'st-appearance-vars';

/** `?nocss` in the address turns custom CSS and HTML cards off until the next full reload. */
export function safeModeFrom(search: string): boolean {
  return new URLSearchParams(search).has('nocss');
}

/** Read once at load, so the flag survives moving around the app to fix the CSS. */
export const SAFE_MODE = typeof location !== 'undefined' && safeModeFrom(location.search);

function styleElement(id: string, before?: HTMLElement): HTMLElement {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    document.head.insertBefore(el, before ?? null);
  }
  return el;
}

/**
 * Puts the appearance on the root element: data attributes (theme, stack, density, logo shape) that
 * styles.css keys on, accent and radius variables, and the user's CSS last. "system" follows the OS
 * dark mode live; the returned function stops listening. In safe mode the custom CSS is left out.
 */
export function applyAppearance(a: Appearance, root: HTMLElement = document.documentElement, safe = SAFE_MODE): () => void {
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
  // A style rule, not an inline style: inline values would beat `:root { --accent: … }` in custom CSS.
  // The first-paint script in index.html sets --accent inline, so that copy is removed here.
  root.style.removeProperty('--accent');
  root.style.removeProperty('--radius');
  const custom = styleElement(STYLE_ID);
  styleElement(VARS_ID, custom).textContent = `:root { --accent: ${a.accent}; --radius: ${a.radius}px; }`;
  custom.textContent = safe ? '' : a.customCss;
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
