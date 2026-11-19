import { eq } from 'drizzle-orm';
import { Appearance, mergeAppearance } from '../../shared/appearance.js';
import { settings } from '../db/schema.js';
import type { ServiceCtx } from './context.js';

const KEY = 'appearance';

export function getAppearance(ctx: ServiceCtx): Appearance {
  const raw = ctx.db.select().from(settings).where(eq(settings.key, KEY)).get()?.value;
  let stored: unknown = null;
  try {
    stored = raw ? JSON.parse(raw) : null;
  } catch {
    // corrupt row: fall back to defaults
  }
  return mergeAppearance(stored);
}

/** Strict on write (invalid input is a 400), then normalized so the card list is complete. */
export function setAppearance(ctx: ServiceCtx, input: unknown): Appearance {
  const value = mergeAppearance(Appearance.parse(input));
  const json = JSON.stringify(value);
  ctx.db.insert(settings).values({ key: KEY, value: json }).onConflictDoUpdate({ target: settings.key, set: { value: json } }).run();
  return value;
}
