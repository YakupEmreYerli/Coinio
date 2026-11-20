import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/server/db/client.js';
import { notificationChannels, payments, settings, subscriptions } from '../src/server/db/schema.js';

const SRC = join(process.cwd(), 'src/server/db/migrations');

/** A database file migrated only up to v0.1 (migration 0000), as an existing install has it. */
function v01Database(): string {
  const dir = mkdtempSync(join(tmpdir(), 'coinio-mig-'));
  const old = join(dir, 'migrations');
  cpSync(SRC, old, { recursive: true });
  const journalPath = join(old, 'meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: unknown[] };
  journal.entries = journal.entries.slice(0, 1);
  writeFileSync(journalPath, JSON.stringify(journal));
  const file = join(dir, 'coinio.db');
  const sqlite = new Database(file);
  migrate(drizzle(sqlite), { migrationsFolder: old });
  sqlite.close();
  return file;
}

describe('notifications migration', () => {
  it('moves reminder_days into reminder_offsets and the Telegram settings into a channel, keeping payments', () => {
    const file = v01Database();
    const raw = new Database(file);
    raw.exec(`
      INSERT INTO users (id, username, password_hash, created_at) VALUES (1, 'y', 'x', '2026-01-01');
      INSERT INTO subscriptions (id, user_id, name, amount_minor, currency, cycle, interval_count, anchor_day, next_due, auto_pay, reminder_days, active, created_at, updated_at, variable_amount)
        VALUES (1, 1, 'Default', 100, 'USD', 'monthly', 1, 1, '2026-12-01', 1, 1, 1, 'x', 'x', 0),
               (2, 1, 'Week', 100, 'USD', 'monthly', 1, 1, '2026-12-01', 1, 7, 1, 'x', 'x', 0),
               (3, 1, 'DueDay', 100, 'USD', 'yearly', 1, 1, '2026-12-01', 0, 0, 1, 'x', 'x', 0);
      INSERT INTO payments (subscription_id, due_date, paid_at, amount_minor, currency, source, status)
        VALUES (2, '2026-11-01', 'x', 100, 'USD', 'manual', 'paid');
      INSERT INTO settings (key, value) VALUES ('telegramBotToken', 'TOKEN'), ('telegramChatId', '42'), ('lastReminderDate', '2026-11-19'), ('locale', 'tr');
    `);
    raw.close();

    const db = openDb(file);
    const subs = db.select().from(subscriptions).orderBy(subscriptions.id).all();
    expect(subs.map((s) => s.reminderOffsets)).toEqual([null, [7], [0]]);
    expect(subs.every((s) => s.trialEndsAt === null)).toBe(true);
    expect('reminderDays' in subs[0]!).toBe(false);
    expect(db.select().from(payments).all()).toHaveLength(1);
    const channels = db.select().from(notificationChannels).all();
    expect(channels).toEqual([
      expect.objectContaining({ type: 'telegram', name: 'Telegram', enabled: true, config: { chatId: '42' }, secrets: { botToken: 'TOKEN' } }),
    ]);
    expect(db.select().from(settings).all().map((r) => r.key)).toEqual(['locale']);
  });

  it('creates no channel when Telegram was never set up', () => {
    const db = openDb(v01Database());
    expect(db.select().from(notificationChannels).all()).toEqual([]);
  });
});
