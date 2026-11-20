import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { notificationChannels } from '../../db/schema.js';
import { CHANNEL_FIELDS, CHANNEL_TYPES, parseChannelValues, type ApiChannel, type ChannelType } from '../../../shared/notify/types.js';
import type { ServiceCtx } from '../context.js';
import { getInternalValue, setInternalValue } from '../settings.js';
import { NotFoundError } from '../errors.js';

export type ChannelRow = typeof notificationChannels.$inferSelect;

const values = z.record(z.string(), z.unknown()).default({});

export const ChannelInput = z.object({
  type: z.enum(CHANNEL_TYPES),
  name: z.string().trim().min(1).max(60),
  enabled: z.boolean().default(true),
  config: values,
  secrets: values,
});

export const ChannelPatch = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  secrets: z.record(z.string(), z.unknown()).optional(),
});

/** What the client may see: every non-secret value, and for secrets only whether one is saved. */
export function channelToApi(row: ChannelRow): ApiChannel {
  const type = row.type as ChannelType;
  return {
    id: row.id,
    type,
    name: row.name,
    enabled: row.enabled,
    config: row.config,
    secrets: Object.fromEntries(CHANNEL_FIELDS[type].filter((f) => f.secret).map((f) => [f.key, Boolean(row.secrets[f.key])])),
    createdAt: row.createdAt,
  };
}

export function listChannels(ctx: ServiceCtx): ChannelRow[] {
  return ctx.db.select().from(notificationChannels).orderBy(asc(notificationChannels.id)).all();
}

export function getChannel(ctx: ServiceCtx, id: number): ChannelRow {
  const row = ctx.db.select().from(notificationChannels).where(eq(notificationChannels.id, id)).get();
  if (!row) throw new NotFoundError('channel');
  return row;
}

const mergeSecrets = (old: Record<string, string>, next: Record<string, string | null>) => {
  const out = { ...old };
  for (const [k, v] of Object.entries(next)) {
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return out;
};

/** A channel built from the form without saving it (for "Send test" before saving); an id fills in saved secrets. */
export function draftChannel(ctx: ServiceCtx, input: unknown, id?: number): ChannelRow {
  const v = ChannelInput.parse(input);
  const saved = id === undefined ? null : getChannel(ctx, id);
  const keep = saved && saved.type === v.type ? Object.keys(saved.secrets) : [];
  const parsed = parseChannelValues(v.type, v.config, v.secrets, keep);
  const stamp = ctx.now().toISOString();
  return {
    id: saved?.id ?? 0,
    type: v.type,
    name: v.name,
    enabled: v.enabled,
    config: parsed.config,
    secrets: mergeSecrets(saved && saved.type === v.type ? saved.secrets : {}, parsed.secrets),
    createdAt: saved?.createdAt ?? stamp,
    updatedAt: stamp,
  };
}

export function createChannel(ctx: ServiceCtx, input: unknown): ChannelRow {
  const d = draftChannel(ctx, input);
  return ctx.db
    .insert(notificationChannels)
    .values({ type: d.type, name: d.name, enabled: d.enabled, config: d.config, secrets: d.secrets, createdAt: d.createdAt, updatedAt: d.updatedAt })
    .returning()
    .get();
}

export function updateChannel(ctx: ServiceCtx, id: number, patch: unknown): ChannelRow {
  const v = ChannelPatch.parse(patch);
  const row = getChannel(ctx, id);
  const set: Partial<ChannelRow> = { updatedAt: ctx.now().toISOString() };
  if (v.name !== undefined) set.name = v.name;
  if (v.enabled !== undefined) set.enabled = v.enabled;
  if (v.config !== undefined || v.secrets !== undefined) {
    const type = row.type as ChannelType;
    const parsed = parseChannelValues(type, v.config ?? row.config, v.secrets ?? {}, Object.keys(row.secrets));
    set.config = parsed.config;
    set.secrets = mergeSecrets(row.secrets, parsed.secrets);
  }
  return ctx.db.update(notificationChannels).set(set).where(eq(notificationChannels.id, id)).returning().get();
}

export function deleteChannel(ctx: ServiceCtx, id: number): void {
  getChannel(ctx, id);
  ctx.db.delete(notificationChannels).where(eq(notificationChannels.id, id)).run();
}

/**
 * COINIO_TELEGRAM_BOT_TOKEN / _CHAT_ID become a Telegram channel once, on the first start that sees them;
 * from then on the channel is managed in the app (deleting it does not bring it back).
 */
export function seedTelegramFromEnv(ctx: ServiceCtx): void {
  const { telegramBotToken: token, telegramChatId: chatId, telegramThreadId } = ctx.config;
  if (!token || !chatId || getInternalValue(ctx, 'notifyEnvTelegramSeeded')) return;
  const threadId = Number(telegramThreadId);
  const config = { chatId, ...(Number.isInteger(threadId) && threadId > 0 ? { threadId } : {}) };
  const stamp = ctx.now().toISOString();
  const exists = listChannels(ctx).some((c) => c.type === 'telegram' && c.secrets.botToken === token && c.config.chatId === chatId);
  if (!exists) {
    ctx.db.insert(notificationChannels).values({
      type: 'telegram', name: 'Telegram', enabled: true, config, secrets: { botToken: token }, createdAt: stamp, updatedAt: stamp,
    }).run();
  }
  setInternalValue(ctx, 'notifyEnvTelegramSeeded', stamp);
}
