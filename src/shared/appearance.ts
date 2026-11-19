import { z } from 'zod';

export const THEMES = ['paper', 'white', 'night', 'black', 'system'] as const;
export const STACKS = ['rafine', 'editorial', 'warm', 'technical', 'bold', 'system'] as const;
export const CARD_IDS = ['greeting', 'month', 'stats', 'upcoming', 'quickAdd', 'week', 'distribution', 'activity', 'allSubscriptions'] as const;

export type Theme = (typeof THEMES)[number];
export type Stack = (typeof STACKS)[number];
export type CardId = (typeof CARD_IDS)[number];

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
const htmlCardId = z.string().regex(/^[a-z0-9-]{1,40}$/);

const HtmlCard = z.object({
  id: htmlCardId,
  title: z.string().max(80),
  html: z.string().max(50_000),
  height: z.number().int().min(80).max(1200),
});

const CardEntry = z.object({
  id: z.union([z.enum(CARD_IDS), z.string().regex(/^html:[a-z0-9-]{1,40}$/)]),
  visible: z.boolean(),
});

export const Appearance = z.object({
  theme: z.enum(THEMES),
  stack: z.enum(STACKS),
  accent: hex,
  density: z.enum(['comfy', 'compact']),
  radius: z.number().int().min(0).max(20),
  logoShape: z.enum(['circle', 'rounded']),
  cents: z.enum(['superscript', 'inline', 'hidden']),
  showForeign: z.boolean(),
  cards: z.array(CardEntry).max(100),
  htmlCards: z.array(HtmlCard).max(20),
  customCss: z.string().max(50_000),
  categoryColors: z.record(z.string().max(80), hex),
});
export type Appearance = z.infer<typeof Appearance>;
export type HtmlCard = z.infer<typeof HtmlCard>;

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'paper',
  stack: 'rafine',
  accent: '#4f5bd5',
  density: 'comfy',
  radius: 12,
  logoShape: 'circle',
  cents: 'superscript',
  showForeign: true,
  cards: CARD_IDS.map((id) => ({ id, visible: true })),
  htmlCards: [],
  customCss: '',
  categoryColors: {},
};

/**
 * Lenient read of stored (or imported) appearance: each invalid field falls back to its default,
 * unknown cards are dropped and cards missing from the list are appended as visible.
 */
export function mergeAppearance(stored: unknown): Appearance {
  const src = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
  const out = { ...DEFAULT_APPEARANCE } as Record<string, unknown>;
  for (const [key, schema] of Object.entries(Appearance.shape)) {
    if (key === 'cards') continue;
    const parsed = (schema as z.ZodType).safeParse(src[key]);
    if (parsed.success) out[key] = parsed.data;
  }
  const htmlIds = new Set((out.htmlCards as HtmlCard[]).map((c) => `html:${c.id}`));
  const known = (id: string) => (CARD_IDS as readonly string[]).includes(id) || htmlIds.has(id);
  const rawCards = Array.isArray(src.cards) ? src.cards : [];
  const cards: Appearance['cards'] = [];
  for (const raw of rawCards) {
    const parsed = CardEntry.safeParse(raw);
    if (parsed.success && known(parsed.data.id) && !cards.some((c) => c.id === parsed.data.id)) cards.push(parsed.data);
  }
  for (const id of [...CARD_IDS, ...htmlIds]) if (!cards.some((c) => c.id === id)) cards.push({ id, visible: true });
  out.cards = cards;
  return out as Appearance;
}
