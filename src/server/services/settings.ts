import { and, eq } from 'drizzle-orm';
import { instanceSettings, settings } from '../db/schema.js';
import { SettingsPatch, type Settings } from '../../shared/types.js';
import type { ServiceCtx } from './context.js';

const DEFAULTS: Settings = {
  baseCurrency: 'USD',
  timezone: 'UTC',
  locale: 'en',
  reminderTime: '09:00',
};

const rowsOf = (ctx: ServiceCtx, userId: number) => ctx.db.select().from(settings).where(eq(settings.userId, userId)).all();

/** Code defaults, then the user's stored rows. */
export function getSettings(ctx: ServiceCtx, userId: number): Settings {
  const stored = Object.fromEntries(rowsOf(ctx, userId).map((r) => [r.key, r.value]));
  const merged = { ...DEFAULTS } as Record<string, unknown>;
  for (const key of Object.keys(DEFAULTS)) if (key in stored) merged[key] = stored[key];
  return merged as Settings;
}

export type UserKey = 'notify' | 'notifyTemplates' | 'onboarded' | 'sampleIds' | 'appearance';

/** A user's own value stored beside the settings; never part of the public Settings. */
export function getUserValue(ctx: ServiceCtx, userId: number, key: UserKey): string | null {
  return ctx.db.select().from(settings).where(and(eq(settings.userId, userId), eq(settings.key, key))).get()?.value ?? null;
}

export function setUserValue(ctx: ServiceCtx, userId: number, key: UserKey, value: string): void {
  ctx.db
    .insert(settings)
    .values({ userId, key, value })
    .onConflictDoUpdate({ target: [settings.userId, settings.key], set: { value } })
    .run();
}

export type InstanceKey = 'lastFxDate' | 'notifyEnvTelegramSeeded';

/** Scheduler bookkeeping that belongs to the whole server. */
export function getInstanceValue(ctx: ServiceCtx, key: InstanceKey): string | null {
  return ctx.db.select().from(instanceSettings).where(eq(instanceSettings.key, key)).get()?.value ?? null;
}

export function setInstanceValue(ctx: ServiceCtx, key: InstanceKey, value: string): void {
  ctx.db.insert(instanceSettings).values({ key, value }).onConflictDoUpdate({ target: instanceSettings.key, set: { value } }).run();
}

export function updateSettings(ctx: ServiceCtx, userId: number, patch: unknown): Settings {
  const parsed = SettingsPatch.parse(patch);
  ctx.db.transaction((tx) => {
    for (const [key, value] of Object.entries(parsed)) {
      if (value === undefined) continue;
      if (value === null) tx.delete(settings).where(and(eq(settings.userId, userId), eq(settings.key, key))).run();
      else {
        tx.insert(settings)
          .values({ userId, key, value })
          .onConflictDoUpdate({ target: [settings.userId, settings.key], set: { value } })
          .run();
      }
    }
  });
  return getSettings(ctx, userId);
}
