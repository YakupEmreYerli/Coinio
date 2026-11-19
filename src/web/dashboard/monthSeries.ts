export type SeriesInput = {
  today: string;
  paid: { dueDate: string; baseMinor: number; subscriptionId: number }[];
  pending: { dueDate: string; baseMinor: number; overdue: boolean; subscriptionId: number }[];
};
export type Marker = { day: number; cumMinor: number; subscriptionId: number; state: 'paid' | 'overdue' | 'pending' };
export type MonthSeries = { paid: [number, number][]; projected: [number, number][]; markers: Marker[]; daysInMonth: number; today: number; total: number };

const dayOf = (iso: string) => Number(iso.slice(8, 10));

/**
 * Cumulative spend over the current month as step points: what was paid up to today (solid line),
 * then the projection (overdue items land on today, the rest on their due day).
 */
export function buildMonthSeries({ today, paid, pending }: SeriesInput): MonthSeries {
  const [y, m] = today.split('-').map(Number) as [number, number];
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const t = dayOf(today);
  const markers: Marker[] = [];
  const paidPts: [number, number][] = [[1, 0]];
  let cum = 0;
  const byDay = (a: { dueDate: string }, b: { dueDate: string }) => a.dueDate.localeCompare(b.dueDate);
  // A payment made ahead of its due day is money already spent: it lands on today, not in the future.
  for (const p of [...paid].sort(byDay)) {
    const d = Math.min(dayOf(p.dueDate), t);
    paidPts.push([d, cum]);
    cum += p.baseMinor;
    paidPts.push([d, cum]);
    markers.push({ day: d, cumMinor: cum, subscriptionId: p.subscriptionId, state: 'paid' });
  }
  paidPts.push([t, cum]);
  const projected: [number, number][] = [[t, cum]];
  const future = [...pending].map((p) => ({ ...p, day: p.overdue ? t : dayOf(p.dueDate) })).sort((a, b) => a.day - b.day);
  for (const p of future) {
    projected.push([p.day, cum]);
    cum += p.baseMinor;
    projected.push([p.day, cum]);
    markers.push({ day: p.day, cumMinor: cum, subscriptionId: p.subscriptionId, state: p.overdue ? 'overdue' : 'pending' });
  }
  projected.push([daysInMonth, cum]);
  return { paid: dedupe(paidPts), projected: dedupe(projected), markers, daysInMonth, today: t, total: cum };
}

/** Drops repeated points and the middle of vertical runs (several payments on one day). */
function dedupe(pts: [number, number][]): [number, number][] {
  const uniq = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1]![0] || p[1] !== pts[i - 1]![1]);
  return uniq.filter((p, i) => !(i > 0 && i < uniq.length - 1 && uniq[i - 1]![0] === p[0] && uniq[i + 1]![0] === p[0]));
}
