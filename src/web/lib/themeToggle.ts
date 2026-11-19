import { DEFAULT_APPEARANCE } from '../../shared/appearance';
import { useAppearance, useSaveAppearance } from './hooks';

const DARK = new Set(['night', 'black']);

/** Quick light/dark switch for the account menu; full theme choice lives in Settings › Appearance. */
export function useThemeToggle() {
  const appearance = useAppearance().data ?? DEFAULT_APPEARANCE;
  const save = useSaveAppearance();
  const systemDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = DARK.has(appearance.theme) || (appearance.theme === 'system' && systemDark);
  return { dark, toggle: () => save.mutate({ ...appearance, theme: dark ? 'paper' : 'night' }) };
}
