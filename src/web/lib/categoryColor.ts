import { useMemo } from 'react';
import { useAppearanceValue } from './appearanceContext';
import { useSubscriptions } from './hooks';

/** Distinct, readable on light and dark. Used in order, so the first eight categories never share a colour. */
export const CATEGORY_PALETTE = ['#e8743b', '#4f6bd5', '#2f9b6a', '#c9476b', '#d9a21b', '#7c3aed', '#0891b2', '#64748b', '#be123c', '#65a30d'];

function hashIndex(name: string): number {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h % CATEGORY_PALETTE.length;
}

/** User-chosen colour, else the category's place among all categories (alphabetical), else a hash. */
export function categoryColor(name: string | null, chosen: Record<string, string>, all: string[] = []): string {
  if (!name) return 'var(--text-3)';
  if (chosen[name]) return chosen[name]!;
  const i = all.indexOf(name);
  return CATEGORY_PALETTE[(i >= 0 ? i : hashIndex(name)) % CATEGORY_PALETTE.length]!;
}

/** Colour lookup bound to the current categories and the user's picks. */
export function useCategoryColor(): (name: string | null) => string {
  const subs = useSubscriptions().data;
  const chosen = useAppearanceValue().categoryColors;
  const all = useMemo(() => [...new Set((subs ?? []).map((s) => s.category).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'tr')), [subs]);
  return (name) => categoryColor(name, chosen, all);
}
