import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { apiKeys, notificationChannels, oauthTokens, payments, settings, subscriptions, users } from '../src/server/db/schema.js';
import { createApiKey } from '../src/server/services/apiKeys.js';
import type { ServiceCtx } from '../src/server/services/context.js';
import { replaceLogo, storeUploadedLogo } from '../src/server/services/logos.js';
import { createChannel } from '../src/server/services/notify/channels.js';
import { updateSettings } from '../src/server/services/settings.js';
import { createSubscription, markPaid } from '../src/server/services/subscriptions.js';
import { deleteUser } from '../src/server/services/users.js';
import { addUser, makeTestApp } from './helpers.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b00000000049454e44ae426082', 'hex');

describe('deleteUser', () => {
  it('removes every row and uploaded logo of the user and nothing of anyone else', () => {
    const t = makeTestApp();
    const onUserDeleted = vi.fn();
    const ctx: ServiceCtx = { db: t.db, config: t.config, fetch, now: () => t.clock.now, plugins: [{ name: 'p', onUserDeleted }] };
    const a = addUser(t, 'a');
    const b = addUser(t, 'b');
    const seed = (userId: number) => {
      const sub = createSubscription(ctx, userId, { name: 'X', amountMinor: 100, currency: 'USD', cycle: 'monthly', intervalCount: 1, nextDue: '2026-11-18' });
      markPaid(ctx, userId, sub.id, { now: t.clock.now });
      const logo = storeUploadedLogo(ctx, PNG, 'png');
      replaceLogo(ctx, sub.id, logo);
      createChannel(ctx, userId, { type: 'slack', name: 'S', config: {}, secrets: { webhookUrl: 'https://hooks.slack.test/x' } });
      createApiKey(ctx, userId, 'k', 'read');
      updateSettings(ctx, userId, { baseCurrency: 'TRY' });
      t.db.insert(oauthTokens).values({ tokenHash: `h${userId}`, kind: 'access', clientId: 'c', userId, scopes: 'read', expiresAt: '2099-01-01' }).run();
      return logo;
    };
    const logoA = seed(a.id);
    const logoB = seed(b.id);
    const logoFile = (n: string) => join(t.config.dataDir, 'logos', n);

    deleteUser(ctx, a.id);

    for (const table of [subscriptions, notificationChannels, apiKeys, settings, oauthTokens]) {
      expect(t.db.select().from(table).where(eq(table.userId, a.id)).all()).toEqual([]);
      expect(t.db.select().from(table).where(eq(table.userId, b.id)).all().length).toBeGreaterThan(0);
    }
    expect(t.db.select().from(users).all().map((u) => u.id)).toEqual([b.id]);
    expect(t.db.select().from(payments).all()).toHaveLength(1);
    expect(existsSync(logoFile(logoA))).toBe(false);
    expect(existsSync(logoFile(logoB))).toBe(true);
    expect(onUserDeleted).toHaveBeenCalledWith(ctx, a.id);
  });
});
