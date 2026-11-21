import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/server/db/client.js';
import { instanceSettings, notificationChannels, notificationLog, payments, settings, subscriptions } from '../src/server/db/schema.js';

const SRC = join(process.cwd(), 'src/server/db/migrations');

/** A database file migrated only through the first `count` migrations, as an older install has it. */
function databaseUpTo(count: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'coinio-mig-'));
  const old = join(dir, 'migrations');
  cpSync(SRC, old, { recursive: true });
  const journalPath = join(old, 'meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: unknown[] };
  journal.entries = journal.entries.slice(0, count);
  writeFileSync(journalPath, JSON.stringify(journal));
  const file = join(dir, 'coinio.db');
  const sqlite = new Database(file);
  migrate(drizzle(sqlite), { migrationsFolder: old });
  sqlite.close();
  return file;
}

/** v0.1 (migration 0000 only). */
const v01Database = () => databaseUpTo(1);

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

describe('per-user migration', () => {
  it('assigns settings, channels and the log to the first user and moves server values to instance_settings', () => {
    const file = databaseUpTo(3);
    const raw = new Database(file);
    raw.exec(`
      INSERT INTO users (id, username, password_hash, created_at) VALUES (3, 'y', 'x', '2026-01-01'), (5, 'z', 'x', '2026-01-02');
      INSERT INTO settings (key, value) VALUES ('baseCurrency', 'TRY'), ('appearance', '{"theme":"dark"}'), ('notify', '{}'),
        ('lastFxDate', '2026-11-20'), ('notifyEnvTelegramSeeded', 'x'), ('onboarded', '1');
      INSERT INTO notification_channels (id, type, name, enabled, config, secrets, created_at, updated_at)
        VALUES (7, 'telegram', 'Telegram', 1, '{"chatId":"42"}', '{"botToken":"T"}', 'x', 'x');
      INSERT INTO notification_log (dedup_key, type, channel_id, title, payload, status, attempts, created_at)
        VALUES ('k', 'reminder', 7, 't', '{}', 'sent', 1, 'x');
    `);
    raw.close();

    const db = openDb(file);
    const rows = db.select().from(settings).all();
    expect(rows.map((r) => [r.userId, r.key, r.value]).sort()).toEqual(
      [
        [3, 'appearance', '{"theme":"dark"}'],
        [3, 'baseCurrency', 'TRY'],
        [3, 'notify', '{}'],
        [3, 'onboarded', '1'],
      ].sort(),
    );
    expect(db.select().from(instanceSettings).all().map((r) => [r.key, r.value]).sort()).toEqual([
      ['lastFxDate', '2026-11-20'],
      ['notifyEnvTelegramSeeded', 'x'],
    ]);
    expect(db.select().from(notificationChannels).all()).toEqual([expect.objectContaining({ id: 7, userId: 3 })]);
    expect(db.select().from(notificationLog).all()).toEqual([expect.objectContaining({ channelId: 7, userId: 3 })]);
  });

  it('migrates a database that has no user yet', () => {
    const file = databaseUpTo(3);
    const raw = new Database(file);
    raw.exec(`INSERT INTO settings (key, value) VALUES ('lastFxDate', '2026-11-20'), ('baseCurrency', 'EUR');`);
    raw.close();

    const db = openDb(file);
    expect(db.select().from(settings).all()).toEqual([]);
    expect(db.select().from(instanceSettings).all()).toEqual([{ key: 'lastFxDate', value: '2026-11-20' }]);
  });
});
