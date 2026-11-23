// The user's Firefly III connection and per-subscription links. The token never leaves this module's rows.
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { fireflyConnections, fireflyLinks, fireflyPaymentLinks } from '../../db/schema.js';
import type { ServiceCtx } from '../context.js';
import { NotFoundError } from '../errors.js';
import { about, listAssetAccounts, type FireflyConn } from './client.js';

export type ConnectionRow = typeof fireflyConnections.$inferSelect;

export type ApiFireflyConnection = {
  baseUrl: string; hasToken: true; assetAccountId: string | null; enabled: boolean; initialSyncDone: boolean;
  lastSyncAt: string | null; lastError: string | null; excluded: { subscriptions: number[]; bills: string[] };
};

export function getConnection(ctx: ServiceCtx, userId: number): ConnectionRow | null {
  return ctx.db.select().from(fireflyConnections).where(eq(fireflyConnections.userId, userId)).get() ?? null;
}

/** `assetAccountId` is stored as '' until the user picks one. */
export function connectionToApi(row: ConnectionRow): ApiFireflyConnection {
  return {
    baseUrl: row.baseUrl, hasToken: true, assetAccountId: row.assetAccountId || null, enabled: row.enabled, initialSyncDone: row.initialSyncDone,
    lastSyncAt: row.lastSyncAt, lastError: row.lastError, excluded: row.excluded,
  };
}

export const connOf = (row: ConnectionRow): FireflyConn => ({ baseUrl: row.baseUrl, token: row.token });

/** Trims, and drops a trailing `/` or `/api` the user may have pasted. */
const normaliseBaseUrl = (url: string) => url.trim().replace(/\/+$/, '').replace(/\/api$/, '');

function dropLinks(ctx: ServiceCtx, userId: number): void {
  ctx.db.delete(fireflyPaymentLinks).where(eq(fireflyPaymentLinks.userId, userId)).run();
  ctx.db.delete(fireflyLinks).where(eq(fireflyLinks.userId, userId)).run();
}

/** Saves only after Firefly answered `about` with these credentials; an empty token keeps the saved one. */
export async function saveConnection(
  ctx: ServiceCtx, userId: number, input: { baseUrl: string; token?: string },
): Promise<{ version: string; accounts: { id: string; name: string; currencyCode: string }[] }> {
  const existing = getConnection(ctx, userId);
  const token = input.token?.trim() || existing?.token;
  if (!token) throw new z.ZodError([{ code: 'custom', path: ['token'], message: 'Token is required', input: input.token }]);
  const conn = { baseUrl: normaliseBaseUrl(input.baseUrl), token };
  const { version } = await about(ctx, conn);
  const accounts = await listAssetAccounts(ctx, conn);
  const now = ctx.now().toISOString();
  if (!existing) {
    ctx.db.insert(fireflyConnections).values({ userId, ...conn, assetAccountId: '', createdAt: now, updatedAt: now }).run();
  } else if (existing.baseUrl !== conn.baseUrl) {
    // A different Firefly: its accounts and bills are unrelated to the old links.
    ctx.db.transaction(() => {
      dropLinks(ctx, userId);
      ctx.db.update(fireflyConnections).set({ ...conn, assetAccountId: '', initialSyncDone: false, lastError: null, updatedAt: now })
        .where(eq(fireflyConnections.userId, userId)).run();
    });
  } else {
    ctx.db.update(fireflyConnections).set({ token, updatedAt: now }).where(eq(fireflyConnections.userId, userId)).run();
  }
  return { version, accounts };
}

export function patchConnection(
  ctx: ServiceCtx, userId: number, patch: { assetAccountId?: string; enabled?: boolean; excluded?: { subscriptions: number[]; bills: string[] } },
): ConnectionRow {
  if (!getConnection(ctx, userId)) throw new NotFoundError('firefly connection');
  return ctx.db.update(fireflyConnections).set({ ...patch, updatedAt: ctx.now().toISOString() })
    .where(eq(fireflyConnections.userId, userId)).returning().get()!;
}

/** Forgets the connection and its links; subscriptions, payments and Firefly itself stay as they are. */
export function deleteConnection(ctx: ServiceCtx, userId: number): void {
  ctx.db.transaction(() => {
    dropLinks(ctx, userId);
    ctx.db.delete(fireflyConnections).where(eq(fireflyConnections.userId, userId)).run();
  });
}

const openLink = (userId: number, subscriptionId: number) =>
  and(eq(fireflyLinks.userId, userId), eq(fireflyLinks.subscriptionId, subscriptionId), eq(fireflyLinks.state, 'open'));

export function getLinkAccount(ctx: ServiceCtx, userId: number, subscriptionId: number): { assetAccountId: string | null } | null {
  const link = ctx.db.select({ assetAccountId: fireflyLinks.assetAccountId }).from(fireflyLinks).where(openLink(userId, subscriptionId)).get();
  return link ?? null;
}

/** `null` falls back to the connection's default account. */
export function setLinkAccount(ctx: ServiceCtx, userId: number, subscriptionId: number, assetAccountId: string | null): void {
  const { changes } = ctx.db.update(fireflyLinks).set({ assetAccountId }).where(openLink(userId, subscriptionId)).run();
  if (!changes) throw new NotFoundError('firefly link');
}
