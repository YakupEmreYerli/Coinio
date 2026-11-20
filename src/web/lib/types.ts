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
};

export type { Appearance, CardId } from '../../shared/appearance';
export type { Settings };

export type Cycle = 'weekly' | 'monthly' | 'yearly';

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
  source: 'manual' | 'auto';
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
  source: 'manual' | 'auto';
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
