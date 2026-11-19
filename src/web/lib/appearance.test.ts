import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APPEARANCE } from '../../shared/appearance';
import { applyAppearance, cacheAppearance, readCachedAppearance, safeModeFrom } from './appearance';

function mockScheme(dark: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const mq = { matches: dark, addEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.add(l), removeEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.delete(l) };
  window.matchMedia = (() => mq) as unknown as typeof window.matchMedia;
  return { set: (v: boolean) => { mq.matches = v; listeners.forEach((l) => l({ matches: v })); }, listeners };
}

afterEach(() => {
  document.getElementById('st-custom-css')?.remove();
  document.getElementById('st-appearance-vars')?.remove();
  vi.restoreAllMocks();
});

describe('applyAppearance', () => {
  it('applies theme, density and accent attributes', () => {
    const root = document.createElement('html');
    applyAppearance({ ...DEFAULT_APPEARANCE, theme: 'night', density: 'compact', accent: '#ea6a12', radius: 4, logoShape: 'rounded' }, root);
    expect(root.dataset.theme).toBe('night');
    expect(root.dataset.density).toBe('compact');
    expect(root.dataset.logo).toBe('rounded');
    expect(document.getElementById('st-appearance-vars')?.textContent).toBe(':root { --accent: #ea6a12; --radius: 4px; }');
  });

  it('custom css comes after the accent and radius so it can override them', () => {
    const root = document.createElement('html');
    root.style.setProperty('--accent', '#111111'); // what the first-paint script leaves inline
    applyAppearance({ ...DEFAULT_APPEARANCE, customCss: ':root { --accent: #ff3d7f; }' }, root);
    expect(root.style.getPropertyValue('--accent')).toBe('');
    const ids = [...document.head.querySelectorAll('style')].map((el) => el.id);
    expect(ids.indexOf('st-appearance-vars')).toBeLessThan(ids.indexOf('st-custom-css'));
    expect(document.documentElement.ownerDocument.defaultView!.getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()).toBe('#ff3d7f');
  });

  it('safe mode (?nocss) leaves the custom css out', () => {
    expect(safeModeFrom('?nocss')).toBe(true);
    expect(safeModeFrom('?x=1&nocss=1')).toBe(true);
    expect(safeModeFrom('')).toBe(false);
    applyAppearance({ ...DEFAULT_APPEARANCE, customCss: 'body{display:none}' }, document.createElement('html'), true);
    expect(document.getElementById('st-custom-css')?.textContent).toBe('');
  });

  it('system theme follows matchMedia change', () => {
    const scheme = mockScheme(false);
    const root = document.createElement('html');
    const stop = applyAppearance({ ...DEFAULT_APPEARANCE, theme: 'system' }, root);
    expect(root.dataset.theme).toBe('paper');
    scheme.set(true);
    expect(root.dataset.theme).toBe('night');
    stop();
    expect(scheme.listeners.size).toBe(0);
  });

  it('custom css is injected and replaced', () => {
    const root = document.createElement('html');
    applyAppearance({ ...DEFAULT_APPEARANCE, customCss: '.a{color:red}' }, root);
    expect(document.getElementById('st-custom-css')?.textContent).toBe('.a{color:red}');
    applyAppearance({ ...DEFAULT_APPEARANCE, customCss: '' }, root);
    expect(document.querySelectorAll('#st-custom-css')).toHaveLength(1);
    expect(document.getElementById('st-custom-css')?.textContent).toBe('');
  });

  it('stack sets the data attribute that switches font variables', () => {
    const root = document.createElement('html');
    applyAppearance({ ...DEFAULT_APPEARANCE, stack: 'editorial' }, root);
    expect(root.dataset.stack).toBe('editorial');
  });

  it('cache read failure falls back to defaults', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readCachedAppearance()).toEqual(DEFAULT_APPEARANCE);
  });

  it('cache round-trips and ignores garbage', () => {
    cacheAppearance({ ...DEFAULT_APPEARANCE, theme: 'black' });
    expect(readCachedAppearance().theme).toBe('black');
    localStorage.setItem('coinio.appearance', '{not json');
    expect(readCachedAppearance()).toEqual(DEFAULT_APPEARANCE);
  });
});
