import { z } from 'zod';
import { LOCALES, type Locale } from './locales';
import { isSupportedCurrency } from './money';
import { ReminderOffsets } from './notify/types';

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const [y, m, d] = s.split('-').map(Number) as [number, number, number];
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }, 'invalid calendar date');

/** Any ISO 4217 code; amounts are integers in its smallest unit (see `minorDigits`). */
const currency = z.string().regex(/^[A-Z]{3}$/).refine(isSupportedCurrency, 'unsupported currency (unknown ISO 4217 code)');

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

/** Older clients send one `reminderDays` number; it becomes a one-item offsets list. */
const legacyReminderDays = (v: unknown) => {
  if (typeof v !== 'object' || v === null || !('reminderDays' in v)) return v;
  const { reminderDays, ...rest } = v as Record<string, unknown>;
  return 'reminderOffsets' in rest || typeof reminderDays !== 'number' ? rest : { ...rest, reminderOffsets: [reminderDays] };
};

const reminderFields = {
  /** Days before each due date (0 = the due day); null follows the defaults for the billing cycle. */
  reminderOffsets: ReminderOffsets.nullable(),
  trialEndsAt: isoDate.nullable(),
};

export const SubscriptionInput = z.preprocess(legacyReminderDays, z.object({
  ...fields,
  autoPay: z.boolean().default(true),
  variableAmount: z.boolean().default(false),
  reminderOffsets: reminderFields.reminderOffsets.default(null),
  trialEndsAt: reminderFields.trialEndsAt.default(null),
}));
export type SubscriptionInput = z.infer<typeof SubscriptionInput>;

export const SubscriptionPatch = z.preprocess(legacyReminderDays, z.object({
  ...fields,
  autoPay: z.boolean(),
  variableAmount: z.boolean(),
  ...reminderFields,
  active: z.boolean(),
}).partial());
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
    locale: z.enum(LOCALES),
    reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .partial();
export type SettingsPatch = z.infer<typeof SettingsPatch>;

export type Settings = {
  baseCurrency: string;
  timezone: string;
  locale: Locale;
  reminderTime: string;
};
