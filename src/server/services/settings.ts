import { eq } from 'drizzle-orm';
import { settings } from '../db/schema.js';
import { SettingsPatch, type Settings } from '../../shared/types.js';
import type { ServiceCtx } from './context.js';

const DEFAULTS: Settings = {
  baseCurrency: 'USD',
  timezone: 'UTC',
  locale: 'en',
  reminderTime: '09:00',
};

/** Code defaults, then stored rows. */
export function getSettings(ctx: ServiceCtx): Settings {
  const stored = Object.fromEntries(ctx.db.select().from(settings).all().map((r) => [r.key, r.value]));
  const merged = { ...DEFAULTS } as Record<string, unknown>;
  for (const key of Object.keys(DEFAULTS)) if (key in stored) merged[key] = stored[key];
  return merged as Settings;
}

type InternalKey = 'lastFxDate' | 'notifyEnvTelegramSeeded' | 'notify' | 'notifyTemplates';

/** Scheduler bookkeeping stored beside the settings; never part of the public Settings. */
export function getInternalValue(ctx: ServiceCtx, key: InternalKey): string | null {
  return ctx.db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null;
}

export function setInternalValue(ctx: ServiceCtx, key: InternalKey, value: string): void {
  ctx.db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
}

export function updateSettings(ctx: ServiceCtx, patch: unknown): Settings {
  const parsed = SettingsPatch.parse(patch);
  ctx.db.transaction((tx) => {
    for (const [key, value] of Object.entries(parsed)) {
      if (value === undefined) continue;
      if (value === null) tx.delete(settings).where(eq(settings.key, key)).run();
      else {
        tx.insert(settings)
          .values({ key, value })
          .onConflictDoUpdate({ target: settings.key, set: { value } })
          .run();
      }
    }
  });
  return getSettings(ctx);
}
