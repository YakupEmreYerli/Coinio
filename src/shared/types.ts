import { z } from 'zod';

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const [y, m, d] = s.split('-').map(Number) as [number, number, number];
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }, 'invalid calendar date');

/** Only 2-decimal currencies are supported in v1 (amounts are stored as integer minor units). */
const currency = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .refine((code) => {
    try {
      // Intl formats any three letters (XXX, ABC) with 2 decimals, so check the known-code list too.
      if (typeof Intl.supportedValuesOf === 'function' && !Intl.supportedValuesOf('currency').includes(code)) return false;
      return new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits === 2;
    } catch {
      return false;
    }
  }, 'unsupported currency (needs exactly 2 decimals)');

const optionalText = (max: number) => z.string().max(max).nullable().optional();

/** Plain host name only: labels of letters, digits and inner hyphens, joined by single dots. */
const hostname = z.preprocess(
  (v) => {
    if (typeof v !== 'string') return v;
    const t = v.trim().toLowerCase();
    return t === '' ? null : t;
  },
  z
    .string()
    .max(253)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/)
    .nullable()
    .optional(),
);

const fields = {
  name: z.string().min(1).max(80),
  amountMinor: z.number().int().min(0),
  currency,
  cycle: z.enum(['weekly', 'monthly', 'yearly']),
  intervalCount: z.number().int().min(1).max(36),
  nextDue: isoDate,
  domain: hostname,
  paymentMethod: optionalText(80),
  category: optionalText(80),
  notes: optionalText(2000),
};

export const SubscriptionInput = z.object({
  ...fields,
  autoPay: z.boolean().default(true),
  variableAmount: z.boolean().default(false),
  reminderDays: z.number().int().min(0).max(30).default(1),
});
export type SubscriptionInput = z.infer<typeof SubscriptionInput>;

export const SubscriptionPatch = z.object({
  ...fields,
  autoPay: z.boolean(),
  variableAmount: z.boolean(),
  reminderDays: z.number().int().min(0).max(30),
  active: z.boolean(),
}).partial();
export type SubscriptionPatch = z.infer<typeof SubscriptionPatch>;

export const PaymentPatch = z
  .object({
    amountMinor: z.number().int().min(0),
    actualBaseMinor: z.number().int().min(0).nullable(),
    status: z.enum(['paid', 'void']),
  })
  .partial();
export type PaymentPatch = z.infer<typeof PaymentPatch>;

export const SkipInput = z.object({ dueDate: isoDate.optional() });

/** GET /api/payments query; from/to filter due_date, both inclusive. */
export const PaymentQuery = z.object({
  subscriptionId: z.coerce.number().int().positive().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  source: z.enum(['manual', 'auto']).optional(),
  status: z.enum(['paid', 'void', 'skipped']).optional(),
});
export type PaymentQuery = z.infer<typeof PaymentQuery>;

export const ExportQuery = z.object({
  format: z.enum(['json', 'csv']),
  what: z.enum(['subscriptions', 'payments']),
});
export type ExportFormat = z.infer<typeof ExportQuery>['format'];

export const PayInput = z.object({
  dueDate: isoDate.optional(),
  actualBaseMinor: z.number().int().min(0).optional(),
  amountMinor: z.number().int().min(0).optional(),
});

export const SettingsPatch = z
  .object({
    baseCurrency: currency,
    timezone: z.string().refine((tz) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'unknown timezone'),
    locale: z.enum(['en', 'tr']),
    reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    telegramBotToken: z.string().min(1).max(200).nullable(),
    telegramChatId: z.string().min(1).max(100).nullable(),
  })
  .partial();
export type SettingsPatch = z.infer<typeof SettingsPatch>;

export type Settings = {
  baseCurrency: string;
  timezone: string;
  locale: 'en' | 'tr';
  reminderTime: string;
  telegramBotToken: string | null;
  telegramChatId: string | null;
};
