import { integer, primaryKey, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').notNull(),
});

export const sessions = sqliteTable('sessions', {
  idHash: text('id_hash').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const subscriptions = sqliteTable('subscriptions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  domain: text('domain'),
  logoPath: text('logo_path'),
  amountMinor: integer('amount_minor').notNull(),
  currency: text('currency').notNull(),
  variableAmount: integer('variable_amount', { mode: 'boolean' }).notNull().default(false),
  cycle: text('cycle', { enum: ['weekly', 'monthly', 'yearly'] }).notNull(),
  intervalCount: integer('interval_count').notNull().default(1),
  anchorDay: integer('anchor_day').notNull(),
  nextDue: text('next_due').notNull(),
  autoPay: integer('auto_pay', { mode: 'boolean' }).notNull().default(true),
  paymentMethod: text('payment_method'),
  category: text('category'),
  notes: text('notes'),
  /** Days before each due date to remind, 0 = the due day; null uses the defaults for the billing cycle. */
  reminderOffsets: text('reminder_offsets', { mode: 'json' }).$type<number[]>(),
  trialEndsAt: text('trial_ends_at'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const payments = sqliteTable(
  'payments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    subscriptionId: integer('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    dueDate: text('due_date').notNull(),
    paidAt: text('paid_at').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull(),
    actualBaseMinor: integer('actual_base_minor'),
    source: text('source', { enum: ['manual', 'auto'] }).notNull(),
    status: text('status', { enum: ['paid', 'void', 'skipped'] }).notNull().default('paid'),
  },
  (t) => [unique('payments_subscription_due_unique').on(t.subscriptionId, t.dueDate)],
);

export const apiKeys = sqliteTable('api_keys', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  prefix: text('prefix').notNull(),
  scope: text('scope', { enum: ['full', 'read'] }).notNull(),
  createdAt: text('created_at').notNull(),
  lastUsedAt: text('last_used_at'),
  revokedAt: text('revoked_at'),
});

export const oauthClients = sqliteTable('oauth_clients', {
  clientId: text('client_id').primaryKey(),
  // Plain text on purpose: the MCP SDK compares secrets directly; strength comes from randomness.
  clientSecret: text('client_secret'),
  metadataJson: text('metadata_json').notNull(),
  createdAt: text('created_at').notNull(),
  lastUsedAt: text('last_used_at'),
});

export const oauthCodes = sqliteTable('oauth_codes', {
  codeHash: text('code_hash').primaryKey(),
  clientId: text('client_id').notNull(),
  userId: integer('user_id').notNull(),
  codeChallenge: text('code_challenge').notNull(),
  redirectUri: text('redirect_uri').notNull(),
  scopes: text('scopes').notNull(),
  expiresAt: text('expires_at').notNull(),
});

export const oauthTokens = sqliteTable('oauth_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  kind: text('kind', { enum: ['access', 'refresh'] }).notNull(),
  clientId: text('client_id').notNull(),
  userId: integer('user_id').notNull(),
  scopes: text('scopes').notNull(),
  expiresAt: text('expires_at').notNull(),
  revokedAt: text('revoked_at'),
});

export const fxRates = sqliteTable(
  'fx_rates',
  {
    base: text('base').notNull(),
    quote: text('quote').notNull(),
    rate: real('rate').notNull(),
    date: text('date').notNull(),
    fetchedAt: text('fetched_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.base, t.quote] })],
);


export const notificationChannels = sqliteTable('notification_channels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),
  name: text('name').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  config: text('config', { mode: 'json' }).$type<Record<string, string | number>>().notNull(),
  /** Never sent to the client. */
  secrets: text('secrets', { mode: 'json' }).$type<Record<string, string>>().notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/** One row per message and channel; `dedup_key` keeps anything from being sent twice. */
export const notificationLog = sqliteTable('notification_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  dedupKey: text('dedup_key').notNull().unique(),
  type: text('type').notNull(),
  channelId: integer('channel_id').references(() => notificationChannels.id, { onDelete: 'set null' }),
  subscriptionId: integer('subscription_id').references(() => subscriptions.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  /** The message already rendered for this channel, so a retry sends exactly the same thing. */
  payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  status: text('status', { enum: ['queued', 'sending', 'sent', 'failed'] }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  error: text('error'),
  nextAttemptAt: text('next_attempt_at'),
  createdAt: text('created_at').notNull(),
  sentAt: text('sent_at'),
});
