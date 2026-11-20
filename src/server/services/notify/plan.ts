// Pure: which notifications are due today. Dates are local calendar dates in the user's time zone
// (`today` comes from todayIn), so time zones and month ends are settled before this runs.
import { addDays, daysBetween } from '../../../shared/notify/vars.js';
import type { NotifySettings } from '../../../shared/notify/types.js';
import type { PaymentRow, Summary, SubscriptionRow } from '../../domain/summary.js';

export type PlannedEvent =
  | { type: 'reminder' | 'dueToday'; key: string; sub: SubscriptionRow; dueDate: string; baseMinor: number | null }
  | { type: 'overdue'; key: string; sub: SubscriptionRow; dueDate: string; baseMinor: number | null }
  | { type: 'trialEnding'; key: string; sub: SubscriptionRow; trialEnd: string; baseMinor: number | null }
  | { type: 'digest'; key: string; from: string; to: string; items: Entry[]; overdue: Entry[] }
  | { type: 'budgetExceeded'; key: string; month: string; budgetMinor: number; spentMinor: number; projectedMinor: number };

type Entry = { sub: SubscriptionRow; dueDate: string; baseMinor: number | null };

/** Overdue alerts go out the day after the due date; a few more days cover a server that was down. */
const OVERDUE_WINDOW = 3;

export function offsetsFor(sub: SubscriptionRow, s: NotifySettings): number[] {
  return sub.reminderOffsets ?? s.offsets[sub.cycle];
}

function daysInMonth(date: string): number {
  const [y, m] = date.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** ISO weekday of a date, 1 = Monday. */
const isoWeekday = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

/** The day before the same day next month (clamped), e.g. Jan 31 → Feb 27 (Feb 28 is the next digest). */
function monthAhead(today: string): string {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const next = `${ny}-${String(nm).padStart(2, '0')}-01`;
  return addDays(`${next.slice(0, 8)}${String(Math.min(d, daysInMonth(next))).padStart(2, '0')}`, -1);
}

export function planNotifications(input: {
  today: string;
  settings: NotifySettings;
  subs: SubscriptionRow[];
  summary: Summary;
  /** Auto-pay payments recorded for today: their due day still gets its "charged today" message. */
  autoPaidToday: PaymentRow[];
}): PlannedEvent[] {
  const { today, settings: s, summary } = input;
  const subs = new Map(input.subs.filter((x) => x.active).map((x) => [x.id, x]));
  const events: PlannedEvent[] = [];
  const entry = (i: { subscriptionId: number; dueDate: string; baseMinor: number | null }): Entry | null => {
    const sub = subs.get(i.subscriptionId);
    return sub ? { sub, dueDate: i.dueDate, baseMinor: i.baseMinor } : null;
  };

  for (const item of summary.upcoming) {
    const sub = subs.get(item.subscriptionId);
    if (!sub || !offsetsFor(sub, s).includes(item.daysLeft)) continue;
    const type = item.daysLeft === 0 ? 'dueToday' : 'reminder';
    events.push({ type, key: `${type}:${sub.id}:${item.dueDate}:${item.daysLeft}`, sub, dueDate: item.dueDate, baseMinor: item.baseMinor });
  }
  for (const p of input.autoPaidToday) {
    const sub = subs.get(p.subscriptionId);
    if (!sub || p.dueDate !== today || p.source !== 'auto' || p.status !== 'paid' || !offsetsFor(sub, s).includes(0)) continue;
    const baseMinor = summary.upcoming.find((i) => i.subscriptionId === sub.id)?.baseMinor ?? (sub.currency === summary.base ? p.amountMinor : null);
    events.push({ type: 'dueToday', key: `dueToday:${sub.id}:${today}:0`, sub, dueDate: today, baseMinor });
  }

  if (s.overdue) {
    for (const item of summary.overdue) {
      const sub = subs.get(item.subscriptionId);
      if (!sub || sub.autoPay || item.daysLeft < -OVERDUE_WINDOW) continue;
      events.push({ type: 'overdue', key: `overdue:${sub.id}:${item.dueDate}`, sub, dueDate: item.dueDate, baseMinor: item.baseMinor });
    }
  }

  if (s.trial.enabled) {
    for (const sub of subs.values()) {
      if (!sub.trialEndsAt) continue;
      const left = daysBetween(today, sub.trialEndsAt);
      if (left < 0 || left > s.trial.days) continue;
      const baseMinor = summary.upcoming.find((i) => i.subscriptionId === sub.id)?.baseMinor ?? null;
      events.push({ type: 'trialEnding', key: `trialEnding:${sub.id}:${sub.trialEndsAt}`, sub, trialEnd: sub.trialEndsAt, baseMinor });
    }
  }

  if (s.budget.enabled && s.budget.amountMinor !== null) {
    const spentMinor = summary.paidThisMonth.reduce((sum, p) => sum + (p.baseMinor ?? 0), 0);
    const projectedMinor = spentMinor + summary.leftThisMonthMinor;
    if (projectedMinor > s.budget.amountMinor) {
      const month = today.slice(0, 7);
      events.push({ type: 'budgetExceeded', key: `budgetExceeded:${month}`, month, budgetMinor: s.budget.amountMinor, spentMinor, projectedMinor });
    }
  }

  const digest = (kind: 'weekly' | 'monthly', to: string, period: string) => {
    const items = summary.upcoming.filter((i) => i.dueDate <= to).map(entry).filter((e): e is Entry => e !== null);
    const overdue = summary.overdue.map(entry).filter((e): e is Entry => e !== null);
    events.push({ type: 'digest', key: `digest:${kind}:${period}`, from: today, to, items, overdue });
  };
  if (s.digestWeekly.enabled && isoWeekday(today) === s.digestWeekly.weekday) digest('weekly', addDays(today, 6), today);
  const day = Number(today.slice(8, 10));
  if (s.digestMonthly.enabled && day === Math.min(s.digestMonthly.day, daysInMonth(today))) digest('monthly', monthAhead(today), today.slice(0, 7));

  return events;
}
