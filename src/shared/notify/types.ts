import { z } from 'zod';
import { templateError } from './template';

export const NOTIFY_TYPES = ['reminder', 'dueToday', 'overdue', 'digest', 'trialEnding', 'budgetExceeded', 'priceChange', 'test'] as const;
export type NotifyType = (typeof NOTIFY_TYPES)[number];

export const CHANNEL_TYPES = ['email', 'telegram', 'discord', 'slack', 'ntfy', 'gotify', 'pushover', 'webhook', 'apprise'] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export type ChannelField = {
  key: string;
  kind: 'text' | 'url' | 'number' | 'select' | 'textarea';
  /** Stored server-side only; the API answers with "saved" instead of the value. */
  secret?: boolean;
  required?: boolean;
  options?: readonly string[];
  default?: string | number;
  placeholder?: string;
};

/** Every channel's settings, in form order. Labels come from the `notify.field.<key>` strings. */
export const CHANNEL_FIELDS: Record<ChannelType, ChannelField[]> = {
  email: [
    { key: 'host', kind: 'text', required: true, placeholder: 'smtp.example.com' },
    { key: 'port', kind: 'number', required: true, default: 587 },
    { key: 'security', kind: 'select', required: true, options: ['starttls', 'tls', 'none'], default: 'starttls' },
    { key: 'user', kind: 'text' },
    { key: 'password', kind: 'text', secret: true },
    { key: 'from', kind: 'text', required: true, placeholder: 'Coinio <coinio@example.com>' },
    { key: 'to', kind: 'text', required: true, placeholder: 'you@example.com' },
  ],
  telegram: [
    { key: 'botToken', kind: 'text', secret: true, required: true, placeholder: '123456:ABC…' },
    { key: 'chatId', kind: 'text', required: true, placeholder: '-1001234567890' },
    /** Forum groups: the topic to post in (Telegram's message_thread_id). */
    { key: 'threadId', kind: 'number', placeholder: '42' },
  ],
  discord: [{ key: 'webhookUrl', kind: 'url', secret: true, required: true, placeholder: 'https://discord.com/api/webhooks/…' }],
  slack: [{ key: 'webhookUrl', kind: 'url', secret: true, required: true, placeholder: 'https://hooks.slack.com/services/…' }],
  ntfy: [
    { key: 'serverUrl', kind: 'url', required: true, default: 'https://ntfy.sh' },
    { key: 'topic', kind: 'text', required: true, placeholder: 'coinio-reminders' },
    { key: 'token', kind: 'text', secret: true, placeholder: 'tk_…' },
  ],
  gotify: [
    { key: 'url', kind: 'url', required: true, placeholder: 'https://gotify.example.com' },
    { key: 'appToken', kind: 'text', secret: true, required: true },
  ],
  pushover: [
    { key: 'userKey', kind: 'text', secret: true, required: true },
    { key: 'appToken', kind: 'text', secret: true, required: true },
  ],
  webhook: [
    { key: 'url', kind: 'url', required: true, placeholder: 'https://example.com/hook' },
    { key: 'method', kind: 'select', required: true, options: ['POST', 'PUT', 'PATCH', 'GET'], default: 'POST' },
    { key: 'headers', kind: 'textarea', secret: true, placeholder: 'Authorization: Bearer …' },
    { key: 'bodyTemplate', kind: 'textarea', placeholder: '{"text": "{{title}}: {{body}}"}' },
  ],
  apprise: [
    { key: 'serverUrl', kind: 'url', required: true, placeholder: 'http://apprise:8000' },
    { key: 'urls', kind: 'textarea', secret: true, required: true, placeholder: 'mailto://user:pass@gmail.com\ntgram://token/chat' },
  ],
};

const httpUrl = z
  .string()
  .max(2000)
  .refine((s) => {
    try {
      const u = new URL(s);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'invalid_url');

/** "Name: value" per line. */
export function parseHeaderLines(text: string): [string, string][] | null {
  const out: [string, string][] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const i = line.indexOf(':');
    if (i < 1) return null;
    const name = line.slice(0, i).trim();
    if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(name)) return null;
    out.push([name, line.slice(i + 1).trim()]);
  }
  return out;
}

function fieldSchema(f: ChannelField): z.ZodType<string | number> {
  switch (f.kind) {
    case 'number':
      return f.key === 'threadId' ? z.coerce.number().int().positive().max(2 ** 53 - 1) : z.coerce.number().int().min(1).max(65535);
    case 'select':
      return z.enum(f.options as [string, ...string[]]);
    case 'url':
      return httpUrl;
    case 'textarea':
      if (f.key === 'headers') return z.string().max(5000).refine((s) => parseHeaderLines(s) !== null, 'invalid_headers');
      if (f.key === 'bodyTemplate') return z.string().max(5000).refine((s) => templateError(s) === null, 'template_invalid');
      return z.string().max(5000);
    default:
      return z.string().trim().max(500);
  }
}

export type ChannelValues = Record<string, string | number>;

/**
 * Validates one channel's values, split into public config and secrets. `keepSecrets` lists secrets
 * already stored, which then count as present for required checks.
 */
export function parseChannelValues(
  type: ChannelType,
  config: Record<string, unknown>,
  secrets: Record<string, unknown>,
  keepSecrets: readonly string[] = [],
): { config: ChannelValues; secrets: Record<string, string | null> } {
  const outConfig: ChannelValues = {};
  const outSecrets: Record<string, string | null> = {};
  const issues: z.core.$ZodIssue[] = [];
  for (const f of CHANNEL_FIELDS[type]) {
    const source = f.secret ? secrets : config;
    const raw = source[f.key];
    // For secrets: undefined or "" keeps the saved value, null clears it.
    if (f.secret && raw === null) {
      outSecrets[f.key] = null;
      if (f.required) issues.push({ code: 'custom', path: [f.key], message: 'required', input: raw });
      continue;
    }
    const empty = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (empty) {
      if (f.secret && keepSecrets.includes(f.key)) continue;
      if (f.default !== undefined && !f.secret) outConfig[f.key] = f.default;
      else if (f.required) issues.push({ code: 'custom', path: [f.key], message: 'required', input: raw });
      continue;
    }
    const parsed = fieldSchema(f).safeParse(raw);
    if (!parsed.success) {
      issues.push(...parsed.error.issues.map((i) => ({ ...i, path: [f.key] })));
      continue;
    }
    if (f.secret) outSecrets[f.key] = String(parsed.data);
    else outConfig[f.key] = parsed.data;
  }
  if (issues.length) throw new z.ZodError(issues);
  return { config: outConfig, secrets: outSecrets };
}

/** Up to 60 days ahead: the same window the app uses for upcoming payments. */
const offsetList = z
  .array(z.number().int().min(0).max(60))
  .max(10)
  .transform((a) => [...new Set(a)].sort((x, y) => y - x));

export const ReminderOffsets = offsetList;

export const NotifySettings = z.object({
  /** Days before the due date, per billing cycle; 0 is the due day itself. */
  offsets: z.object({ weekly: offsetList, monthly: offsetList, yearly: offsetList }),
  overdue: z.boolean(),
  /** ISO weekday, 1 = Monday. */
  digestWeekly: z.object({ enabled: z.boolean(), weekday: z.number().int().min(1).max(7) }),
  /** Day of the month; a shorter month uses its last day. */
  digestMonthly: z.object({ enabled: z.boolean(), day: z.number().int().min(1).max(31) }),
  trial: z.object({ enabled: z.boolean(), days: z.number().int().min(0).max(60) }),
  /** Monthly budget in minor units of the main currency. */
  budget: z.object({ enabled: z.boolean(), amountMinor: z.number().int().min(0).nullable() }),
  priceChange: z.boolean(),
});
export type NotifySettings = z.infer<typeof NotifySettings>;

export const DEFAULT_NOTIFY_SETTINGS: NotifySettings = {
  offsets: { weekly: [3, 1], monthly: [3, 1], yearly: [30, 7, 1] },
  overdue: true,
  digestWeekly: { enabled: false, weekday: 1 },
  digestMonthly: { enabled: false, day: 1 },
  trial: { enabled: true, days: 3 },
  budget: { enabled: false, amountMinor: null },
  priceChange: true,
};

/** Stored settings over the defaults, so settings saved by an older version stay valid. */
export function mergeNotifySettings(stored: unknown): NotifySettings {
  const s = (typeof stored === 'object' && stored !== null ? stored : {}) as Record<string, unknown>;
  const d = DEFAULT_NOTIFY_SETTINGS;
  const obj = (k: keyof NotifySettings) => ({ ...(d[k] as object), ...((typeof s[k] === 'object' && s[k] !== null ? s[k] : {}) as object) });
  const merged = {
    ...d,
    ...s,
    offsets: obj('offsets'),
    digestWeekly: obj('digestWeekly'),
    digestMonthly: obj('digestMonthly'),
    trial: obj('trial'),
    budget: obj('budget'),
  };
  const parsed = NotifySettings.safeParse(merged);
  return parsed.success ? parsed.data : d;
}

export const TemplateText = z.object({
  title: z.string().max(200),
  body: z.string().min(1).max(5000),
}).refine((t) => templateError(t.title) === null && templateError(t.body) === null, { message: 'template_invalid' });
export type TemplateText = z.infer<typeof TemplateText>;
export type TemplateSet = Record<NotifyType, TemplateText>;

const SUB_VARS = ['name', 'amount', 'amountMain', 'dueDate', 'when', 'daysLeft', 'cycle', 'category', 'paymentMethod', 'notes', 'website', 'link', 'autoPay'];

/** Variables offered in the template editor, per type. Names in `items`/`overdue` loops are listed after them. */
export const TEMPLATE_VARIABLES: Record<NotifyType, string[]> = {
  reminder: SUB_VARS,
  dueToday: SUB_VARS,
  overdue: SUB_VARS,
  digest: ['period', 'total', 'items', 'hasOverdue', 'overdue', 'overdueTotal', 'appUrl', 'name', 'amount', 'amountMain', 'dueDate', 'when', 'autoPay', 'link'],
  trialEnding: ['name', 'trialEnd', 'when', 'daysLeft', 'amount', 'amountMain', 'cycle', 'category', 'paymentMethod', 'notes', 'website', 'link'],
  budgetExceeded: ['month', 'budget', 'spent', 'projected', 'over', 'appUrl'],
  priceChange: ['name', 'oldAmount', 'newAmount', 'change', 'paidDate', 'cycle', 'category', 'paymentMethod', 'website', 'link'],
  test: ['channel', 'appUrl'],
};

/**
 * The body format per channel: Markdown where the service renders it, HTML (plus plain text) for email,
 * inline HTML without line-break tags for Telegram and Pushover, plain text inside the JSON of a webhook.
 */
export const CHANNEL_FORMATS: Record<ChannelType, 'markdown' | 'telegram' | 'slack' | 'html' | 'text'> = {
  email: 'html',
  telegram: 'telegram',
  discord: 'markdown',
  slack: 'slack',
  ntfy: 'markdown',
  gotify: 'markdown',
  pushover: 'telegram',
  webhook: 'text',
  apprise: 'markdown',
};

/** One channel as the API returns it: secrets only as "saved" flags. */
export type ApiChannel = {
  id: number;
  type: ChannelType;
  name: string;
  enabled: boolean;
  config: ChannelValues;
  secrets: Record<string, boolean>;
  createdAt: string;
};

export type ApiNotificationLog = {
  id: number;
  type: NotifyType;
  channelId: number | null;
  channelName: string | null;
  title: string;
  status: 'queued' | 'sending' | 'sent' | 'failed';
  attempts: number;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
};
