import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { apiKeys } from '../db/schema.js';
import type { ServiceCtx } from './context.js';
import { NotFoundError } from './subscriptions.js';

export type KeyScope = 'read' | 'full';

const hashKey = (raw: string) => createHash('sha256').update(raw).digest('hex');

export function createApiKey(ctx: ServiceCtx, userId: number, name: string, scope: KeyScope): { key: string; id: number } {
  const key = `st_${scope}_${randomBytes(32).toString('base64url')}`;
  const row = ctx.db
    .insert(apiKeys)
    .values({ userId, name, keyHash: hashKey(key), prefix: key.slice(0, 12), scope, createdAt: ctx.now().toISOString() })
    .returning({ id: apiKeys.id })
    .get();
  return { key, id: row.id };
}

export function verifyApiKey(ctx: ServiceCtx, raw: string): { userId: number; scope: KeyScope; keyId: number } | null {
  const row = ctx.db.select().from(apiKeys).where(eq(apiKeys.keyHash, hashKey(raw))).get();
  if (!row || row.revokedAt) return null;
  ctx.db.update(apiKeys).set({ lastUsedAt: ctx.now().toISOString() }).where(eq(apiKeys.id, row.id)).run();
  return { userId: row.userId, scope: row.scope, keyId: row.id };
}

export function listApiKeys(ctx: ServiceCtx, userId: number) {
  return ctx.db.select().from(apiKeys).where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt))).all();
}

export function revokeApiKey(ctx: ServiceCtx, userId: number, id: number): void {
  const res = ctx.db
    .update(apiKeys)
    .set({ revokedAt: ctx.now().toISOString() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .run();
  if (res.changes === 0) throw new NotFoundError('api key');
}
