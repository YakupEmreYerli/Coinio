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

export const SplitInput = z.object({
  memberId: z.number().int().positive(),
  shareMinor: z.number().int().min(0).nullable().optional(),
});
export type SplitInput = z.infer<typeof SplitInput>;

export const FamilyScope = z.enum(['mine', 'family']);
export type FamilyScope = z.infer<typeof FamilyScope>;

export const ScopeQuery = z.object({
  scope: FamilyScope.optional(),
  memberId: z.coerce.number().int().positive().optional(),
});

export const FAMILY_RELATIONS = ['mother', 'father', 'partner', 'child', 'sibling', 'other'] as const;
export const FamilyRelation = z.enum(FAMILY_RELATIONS);
export type FamilyRelation = z.infer<typeof FamilyRelation>;

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .nullable()
  .optional();

export const CreateFamilyInput = z.object({
  name: z.string().trim().min(1).max(80),
  ownerName: z.string().trim().min(1).max(60).optional(),
  ownerRelation: FamilyRelation.nullable().optional(),
  members: z
    .array(
      z.union([
        z.string().trim().min(1).max(60),
        z.object({ name: z.string().trim().min(1).max(60), relation: FamilyRelation.nullable().optional() }),
      ]),
    )
    .max(11)
    .optional(),
});
export const UpdateFamilyInput = z.object({ name: z.string().trim().min(1).max(80) });
export const CreateMemberInput = z.object({
  name: z.string().trim().min(1).max(60),
  relation: FamilyRelation.nullable().optional(),
  color: hexColor,
});
export const UpdateMemberInput = z
  .object({
    name: z.string().trim().min(1).max(60),
    relation: FamilyRelation.nullable(),
    color: hexColor,
  })
  .partial();
export const CreateInviteInput = z.object({ memberId: z.number().int().positive() });
export const AcceptInviteInput = z.object({
  username: z.string().trim().min(1).max(100).optional(),
  password: z.string().min(10).max(1000).optional(),
  displayName: z.string().trim().min(1).max(60).optional(),
  relation: FamilyRelation.nullable().optional(),
});

export const SubscriptionInput = z.preprocess(legacyReminderDays, z.object({
  ...fields,
  autoPay: z.boolean().default(true),
  variableAmount: z.boolean().default(false),
  reminderOffsets: reminderFields.reminderOffsets.default(null),
  trialEndsAt: reminderFields.trialEndsAt.default(null),
  shared: z.boolean().optional(),
  paidByMemberId: z.number().int().positive().nullable().optional(),
  splits: z.array(SplitInput).optional(),
}));
export type SubscriptionInput = z.infer<typeof SubscriptionInput>;

export const SubscriptionPatch = z.preprocess(legacyReminderDays, z.object({
  ...fields,
  autoPay: z.boolean(),
  variableAmount: z.boolean(),
  ...reminderFields,
  active: z.boolean(),
  shared: z.boolean(),
  paidByMemberId: z.number().int().positive().nullable(),
  splits: z.array(SplitInput),
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
  source: z.enum(['manual', 'auto', 'firefly']).optional(),
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
