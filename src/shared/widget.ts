/** How many due items the widget payload lists (overdue first, then upcoming). */
export const WIDGET_ITEMS = 6;

type SummaryLike<I> = { base: string; leftThisMonthMinor: number; monthlyAverageMinor: number; ratesStale: boolean; overdue: I[]; upcoming: I[] };

/**
 * The `/api/widget` payload, built from a summary. Shared by the server route and by HTML cards
 * the owner lets read their data, so both always get the same shape.
 */
export function widgetPayload<I>(s: SummaryLike<I>, now: Date) {
  return {
    base: s.base,
    leftThisMonthMinor: s.leftThisMonthMinor,
    monthlyAverageMinor: s.monthlyAverageMinor,
    ratesStale: s.ratesStale,
    items: [...s.overdue, ...s.upcoming].slice(0, WIDGET_ITEMS),
    generatedAt: now.toISOString(),
  };
}
