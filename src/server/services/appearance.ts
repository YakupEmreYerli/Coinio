import { Appearance, mergeAppearance } from '../../shared/appearance.js';
import type { ServiceCtx } from './context.js';
import { getUserValue, setUserValue } from './settings.js';

export function getAppearance(ctx: ServiceCtx, userId: number): Appearance {
  const raw = getUserValue(ctx, userId, 'appearance');
  let stored: unknown = null;
  try {
    stored = raw ? JSON.parse(raw) : null;
  } catch {
    // corrupt row: fall back to defaults
  }
  return mergeAppearance(stored);
}

/** Strict on write (invalid input is a 400), then normalized so the card list is complete. */
export function setAppearance(ctx: ServiceCtx, userId: number, input: unknown): Appearance {
  const value = mergeAppearance(Appearance.parse(input));
  setUserValue(ctx, userId, 'appearance', JSON.stringify(value));
  return value;
}
