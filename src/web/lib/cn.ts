import { extendTailwindMerge } from 'tailwind-merge';

// Teach tailwind-merge our token names so `text-text-2` (colour) and `text-[13px]` (size) never cancel out.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: ['bg', 'side', 'card', 'sunk', 'line', 'line-2', 'text', 'text-2', 'text-3', 'accent', 'accent-soft', 'primary', 'primary-fg', 'pos', 'neg', 'neg-soft', 'warn'],
      radius: ['card', 'ctl'],
    },
  },
});

/** Joins class names, skipping falsy values; later Tailwind classes win over earlier conflicting ones. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return twMerge(parts.filter(Boolean).join(' '));
}
