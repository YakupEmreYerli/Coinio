import { eq } from 'drizzle-orm';
import { settings } from '../db/schema.js';
import { SettingsPatch, type Settings } from '../../shared/types.js';
import type { ServiceCtx } from './context.js';

const DEFAULTS: Settings = {
  baseCurrency: 'TRY',
  timezone: 'UTC',
  locale: 'en',
  reminderTime: '09:00',
  telegramBotToken: null,
  telegramChatId: null,
};

/** Code defaults, then stored rows, then env (telegram) on top. */
export function getSettings(ctx: ServiceCtx): Settings {
  const stored = Object.fromEntries(ctx.db.select().from(settings).all().map((r) => [r.key, r.value]));
  const merged = { ...DEFAULTS } as Record<string, unknown>;
  for (const key of Object.keys(DEFAULTS)) if (key in stored) merged[key] = stored[key];
  const result = merged as Settings;
  if (ctx.config.telegramBotToken) result.telegramBotToken = ctx.config.telegramBotToken;
  if (ctx.config.telegramChatId) result.telegramChatId = ctx.config.telegramChatId;
  return result;
}

type InternalKey = 'lastFxDate' | 'lastReminderDate';

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
      // A masked token echoed back by a UI round-trip must not overwrite the real one.
      if (key === 'telegramBotToken' && typeof value === 'string' && value.startsWith('****')) continue;
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
