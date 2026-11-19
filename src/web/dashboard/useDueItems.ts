import { useMemo } from 'react';
import { useSettings, useSubscriptions, useSummary } from '../lib/hooks';
import { todayIn } from '../lib/dates';
import type { ApiSubscription, DueItem } from '../lib/types';

export type DueRowItem = DueItem & { sub: ApiSubscription | undefined; overdue: boolean };

/** Summary joined with subscription details; overdue first, then by date. */
export function useDashboardData() {
  const summary = useSummary();
  const subs = useSubscriptions();
  const settings = useSettings();
  const today = todayIn(settings.data?.timezone ?? 'UTC');
  const byId = useMemo(() => new Map((subs.data ?? []).map((s) => [s.id, s])), [subs.data]);
  const due = useMemo<DueRowItem[]>(() => {
    const s = summary.data;
    if (!s) return [];
    return [
      ...s.overdue.map((d) => ({ ...d, sub: byId.get(d.subscriptionId), overdue: true })),
      ...s.upcoming.map((d) => ({ ...d, sub: byId.get(d.subscriptionId), overdue: false })),
    ];
  }, [summary.data, byId]);
  return { summary: summary.data, subs: subs.data, byId, due, today, base: summary.data?.base ?? settings.data?.baseCurrency ?? 'USD', loading: summary.isLoading || subs.isLoading };
}
