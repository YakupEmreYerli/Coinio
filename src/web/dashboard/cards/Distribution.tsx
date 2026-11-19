import { Money } from '../../components/Money';
import { Card, CardHeader } from '../../components/ui/Card';
import { t } from '../../i18n';
import { useCategoryColor } from '../../lib/categoryColor';
import { monthlyCost } from '../../lib/money';
import { useDashboardData } from '../useDueItems';

/** Largest-remainder rounding so the shown percentages add up to exactly 100. */
export function percents(values: number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (!total) return values.map(() => 0);
  const raw = values.map((v) => (v / total) * 100);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]).forEach(([, i]) => left-- > 0 && out[i]!++);
  return out;
}

export function Distribution() {
  const { subs, summary, base } = useDashboardData();
  const colorOf = useCategoryColor();
  const sums = new Map<string, number>();
  for (const s of subs ?? []) {
    if (!s.active) continue;
    const m = monthlyCost(s, base, summary?.rates);
    if (m === null) continue;
    const key = s.category ?? t('dist.uncategorized');
    sums.set(key, (sums.get(key) ?? 0) + m);
  }
  const rows = [...sums].sort((a, b) => b[1] - a[1]);
  const pct = percents(rows.map((r) => r[1]));
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHeader title={t('dist.title')} sub={t('dist.sub')} />
      <ul aria-label={t('dist.title')} className="flex flex-col gap-3 px-5 pb-5">
        {rows.map(([cat, v], i) => (
          <li key={cat} className="grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-1.5 text-[13.5px]">
            <span className="truncate">{cat}</span>
            <span>
              <Money minor={v} currency={base} size="sm" cents="hidden" className="font-medium" /> <span className="text-text-3">· %{pct[i]}</span>
            </span>
            <div className="col-span-2 h-1.5 overflow-hidden rounded bg-sunk">
              <i className="block h-full rounded" style={{ width: `${pct[i]}%`, background: colorOf(cat) }} />
            </div>
          </li>
        ))}
      </ul>
      {(summary?.unconvertible.length ?? 0) > 0 && <p className="px-5 pb-4 text-xs text-warn">{t('totals.excluded', { n: summary!.unconvertible.length })}</p>}
    </Card>
  );
}
