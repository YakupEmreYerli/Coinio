import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { households, oauthCodes, oauthTokens, subscriptions, users } from '../db/schema.js';
import type { ServiceCtx } from './context.js';
import { dissolveHouseholdTx, getHouseholdContext } from './family.js';
import { deleteLogoFile } from './logos.js';

/**
 * Deletes an account and everything it owns: sessions, settings, subscriptions with their payments, API keys,
 * notification channels and log (by cascade), OAuth codes and tokens, and logo files no other subscription
 * uses. Shared household subscriptions survive member deletion (transferred to owner) and detach cleanly on owner deletion.
 */
export function deleteUser(ctx: ServiceCtx, userId: number): void {
  const hh = getHouseholdContext(ctx.db, userId);
  // Keep logo files referenced by shared subs that transfer to the owner when a linked member deletes their account.
  const preservedSharedSubIds =
    hh && hh.me.role !== 'owner'
      ? new Set(
          ctx.db
            .select({ id: subscriptions.id })
            .from(subscriptions)
            .where(and(eq(subscriptions.userId, userId), eq(subscriptions.householdId, hh.household.id)))
            .all()
            .map((r) => r.id),
        )
      : new Set<number>();

  const logos = ctx.db
    .selectDistinct({ id: subscriptions.id, p: subscriptions.logoPath })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .all()
    .filter((r) => r.p !== null && !preservedSharedSubIds.has(r.id))
    .map((r) => r.p!);

  ctx.db.transaction((tx) => {
    const ownedHousehold = tx.select().from(households).where(eq(households.ownerUserId, userId)).get();
    if (ownedHousehold) {
      dissolveHouseholdTx(tx as unknown as Db, ownedHousehold.id);
    } else if (hh && hh.me.role !== 'owner') {
      tx.update(subscriptions)
        .set({ userId: hh.household.ownerUserId })
        .where(and(eq(subscriptions.userId, userId), eq(subscriptions.householdId, hh.household.id)))
        .run();
    }
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
