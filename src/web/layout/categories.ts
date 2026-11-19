import type { ApiSubscription } from '../lib/types';

/** Distinct categories of active subscriptions with counts, most used first. */
export function categoryCounts(subs: ApiSubscription[]): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const s of subs) if (s.active && s.category) m.set(s.category, (m.get(s.category) ?? 0) + 1);
  return [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'tr'));
}
