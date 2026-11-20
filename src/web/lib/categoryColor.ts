import { useMemo } from 'react';
import { useAppearanceValue } from './appearanceContext';
import { useSubscriptions } from './hooks';

/**
 * Brand-derived: one lightness and chroma in OKLCH (L 0.62), hues spread around the Coinio indigo, so no colour
 * shouts louder than another. Each one keeps at least 3:1 against both the Paper card and the Night card.
 * Used in order, so the first ten categories never share a colour.
 */
export const CATEGORY_PALETTE = ['#5b66d9', '#1d9999', '#b37903', '#c95d7b', '#3e8ec1', '#9e6ec0', '#519962', '#cb6440', '#848d42', '#7d8699'];

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
