import type { Settings } from '../../shared/types';
import type { ApiChannel, NotifySettings, NotifyType, TemplateSet, TemplateText } from '../../shared/notify/types';

export type { ApiChannel, ApiNotificationLog, NotifySettings, NotifyType } from '../../shared/notify/types';

/** GET /api/notifications */
export type NotificationsPage = {
  settings: NotifySettings;
  channels: ApiChannel[];
  templates: Record<NotifyType, TemplateText & { custom: boolean }>;
  defaults: TemplateSet;
  appUrl: string | null;
  /** The signed-in user's address when the server can mail it without settings. */
  accountMail?: string | null;
};

export type { Appearance, CardId } from '../../shared/appearance';
export type { Settings };

export type Cycle = 'weekly' | 'monthly' | 'yearly';

export type FamilyScope = 'mine' | 'family';

export type ApiSubscriptionSplit = {
  memberId: number;
  shareMinor: number | null;
  effectiveMinor: number;
};

export type ApiHousehold = {
  id: number;
  name: string;
  ownerUserId: number;
  myMemberId: number;
  myRole: 'owner' | 'member';
  createdAt: string;
};

export type ApiHouseholdMember = {
  id: number;
  name: string;
  color: string | null;
  role: 'owner' | 'member';
  linkedUserId: number | null;
  linkedUsername: string | null;
  isMe: boolean;
  createdAt: string;
};

export type ApiHouseholdInvite = {
  id: number;
  memberId: number;
  expiresAt: string;
  createdAt: string;
};

export type ApiFamilyState = {
  household: ApiHousehold | null;
  members: ApiHouseholdMember[];
  invites: ApiHouseholdInvite[];
  allowInviteSignup: boolean;
};

export type ApiInvitePreview = {
  valid: boolean;
  expired: boolean;
  used: boolean;
  householdName: string | null;
  memberName: string | null;
  allowInviteSignup: boolean;
  signedIn: boolean;
  alreadyInHousehold: boolean;
};

export type ApiInviteCreated = {
  id: number;
  memberId: number;
  token: string;
  path: string;
  expiresAt: string;
};

export type ApiSubscription = {
  id: number;
  name: string;
  domain: string | null;
  logoPath: string | null;
  amountMinor: number;
  currency: string;
  variableAmount: boolean;
  cycle: Cycle;
  intervalCount: number;
  anchorDay: number;
  nextDue: string;
  autoPay: boolean;
  paymentMethod: string | null;
  category: string | null;
  notes: string | null;
  reminderOffsets: number[] | null;
  trialEndsAt: string | null;
  active: boolean;
  householdId?: number | null;
  paidByMemberId?: number | null;
  splits?: ApiSubscriptionSplit[];
  myShareMinor?: number;
  canEdit?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ApiPayment = {
  id: number;
  subscriptionId: number;
  dueDate: string;
  paidAt: string;
  amountMinor: number;
  currency: string;
  actualBaseMinor: number | null;
  source: 'manual' | 'auto' | 'firefly';
  status: 'paid' | 'void' | 'skipped';
};

export type DueItem = {
  subscriptionId: number;
  name: string;
  logoPath: string | null;
  dueDate: string;
  daysLeft: number;
  amountMinor: number;
  currency: string;
  baseMinor: number | null;
  autoPay: boolean;
  variableAmount: boolean;
};

export type PaidItem = {
  paymentId: number;
  subscriptionId: number;
  name: string;
  dueDate: string;
  paidAt: string;
  amountMinor: number;
  currency: string;
  baseMinor: number | null;
  source: 'manual' | 'auto' | 'firefly';
};

export type Summary = {
  base: string;
  leftThisMonthMinor: number;
  monthlyAverageMinor: number;
  yearlyTotalMinor: number;
  upcoming: DueItem[];
  overdue: DueItem[];
  paidThisMonth: PaidItem[];
  unconvertible: number[];
  ratesStale: boolean;
  rates: Record<string, number>;
};

export type FireflyConnection = {
  baseUrl: string;
  hasToken: true;
  assetAccountId: string | null;
  enabled: boolean;
  initialSyncDone: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  excluded: { subscriptions: number[]; bills: string[] };
  /** Names for `excluded.bills`; only GET /api/firefly fills it. */
  excludedBills?: { id: string; name: string }[];
};

export type FireflyAccount = { id: string; name: string; currencyCode: string };
