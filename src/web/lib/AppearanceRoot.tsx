import { useEffect, useState, type ReactNode } from 'react';
import { applyAppearance, cacheAppearance, readCachedAppearance } from './appearance';
import { AppearanceProvider } from './appearanceContext';
import { useAppearance } from './hooks';

/** Loads appearance (cached copy until the server answers), applies it to the page and provides it. */
export function AppearanceRoot({ children }: { children: ReactNode }) {
  const [cached] = useState(readCachedAppearance);
  const appearance = useAppearance().data ?? cached;
  useEffect(() => {
    cacheAppearance(appearance);
    return applyAppearance(appearance);
  }, [appearance]);
  return <AppearanceProvider value={appearance}>{children}</AppearanceProvider>;
}
