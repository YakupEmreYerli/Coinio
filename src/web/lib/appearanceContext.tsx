import { createContext, useContext } from 'react';
import { DEFAULT_APPEARANCE } from '../../shared/appearance';
import type { Appearance } from './types';

const AppearanceContext = createContext<Appearance>(DEFAULT_APPEARANCE);

export const AppearanceProvider = AppearanceContext.Provider;

/** Current appearance settings (defaults until loaded, and in tests). */
export function useAppearanceValue(): Appearance {
  return useContext(AppearanceContext);
}
