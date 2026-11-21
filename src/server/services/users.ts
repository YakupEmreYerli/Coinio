import { eq, inArray } from 'drizzle-orm';
import { oauthCodes, oauthTokens, subscriptions, users } from '../db/schema.js';
import type { ServiceCtx } from './context.js';
import { deleteLogoFile } from './logos.js';

/**
 * Deletes an account and everything it owns: sessions, settings, subscriptions with their payments, API keys,
 * notification channels and log (by cascade), OAuth codes and tokens, and logo files no other subscription
 * uses. Plugins hear about it afterwards.
 */
export function deleteUser(ctx: ServiceCtx, userId: number): void {
  const logos = ctx.db
    .selectDistinct({ p: subscriptions.logoPath })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .all()
    .map((r) => r.p)
    .filter((p): p is string => p !== null);
  ctx.db.transaction((tx) => {
    tx.delete(oauthCodes).where(eq(oauthCodes.userId, userId)).run();
    tx.delete(oauthTokens).where(eq(oauthTokens.userId, userId)).run();
    tx.delete(users).where(eq(users.id, userId)).run();
  });
  if (logos.length) {
    const kept = new Set(
      ctx.db
        .selectDistinct({ p: subscriptions.logoPath })
        .from(subscriptions)
        .where(inArray(subscriptions.logoPath, logos))
        .all()
        .map((r) => r.p),
    );
    for (const p of logos) if (!kept.has(p)) deleteLogoFile(ctx, p);
  }
  for (const plugin of ctx.plugins ?? []) plugin.onUserDeleted?.(ctx, userId);
}
