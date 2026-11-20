/** The languages Coinio speaks, in the order they are offered. */
export const LOCALES = ['en', 'tr', 'de', 'fr', 'es', 'pt-BR', 'zh-CN', 'ja'] as const;
export type Locale = (typeof LOCALES)[number];

/** Each language in its own name, as shown in language pickers. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  tr: 'Türkçe',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  'pt-BR': 'Português (Brasil)',
  'zh-CN': '简体中文',
  ja: '日本語',
};

export const isLocale = (v: unknown): v is Locale => (LOCALES as readonly unknown[]).includes(v);

/**
 * A BCP 47 tag ("de-AT", "pt", "zh-Hans-CN") → the closest supported locale, or null.
 * Any Portuguese goes to pt-BR and any Chinese to zh-CN: closer than falling back to English.
 */
export function matchLocale(tag: string): Locale | null {
  const base = tag.trim().toLowerCase().split(/[-_]/)[0];
  if (base === 'pt') return 'pt-BR';
  if (base === 'zh') return 'zh-CN';
  return isLocale(base) ? base : null;
}

/** First supported language in a preference list; English otherwise. */
export function pickLocale(tags: readonly string[]): Locale {
  for (const tag of tags) {
    const hit = matchLocale(tag);
    if (hit) return hit;
  }
  return 'en';
}

/** Accept-Language header → the languages in preference order (by q, then position), q=0 dropped. */
export function parseAcceptLanguage(header: string | undefined): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part, i) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => /^\s*q=([\d.]+)\s*$/.exec(p)?.[1]).find(Boolean);
      return { tag: tag.trim(), q: q === undefined ? 1 : Number(q), i };
    })
    .filter((x) => x.tag && x.tag !== '*' && x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i)
    .map((x) => x.tag);
}
