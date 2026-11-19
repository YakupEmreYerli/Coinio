import { useEffect, useRef, useState } from 'react';
import { Logo } from '../../components/Logo';
import { t, useLocale } from '../../i18n';
import type { ApiSubscription } from '../../lib/types';
import type { MonthSeries } from '../monthSeries';

function compact(minor: number, locale: string, currency: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(minor / 100);
}

/** Step chart of the month: paid (solid), projected (dashed), logos above payment days. */
export function MonthChart({ series, byId, month, currency }: { series: MonthSeries; byId: Map<number, ApiSubscription>; month: string; currency: string }) {
  const { locale } = useLocale();
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 240, L = 52, R = 20, T = 40, B = 26;
  const max = Math.max(series.total, 1) * 1.08;
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const x = (d: number) => L + ((d - 1) / Math.max(series.daysInMonth - 1, 1)) * (w - L - R);
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const path = (pts: [number, number][]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(' ');
  const ticks = [1, 8, 15, 22, 29].filter((d) => d <= series.daysInMonth);
  const lastPaid = series.paid[series.paid.length - 1]!;
  const area = `${path(series.paid)} L${x(lastPaid[0])} ${y(0)} L${x(1)} ${y(0)} Z`;
  const r = 13;
  return (
    <div ref={box} className="relative w-full" style={{ height: H }}>
      <svg width={w} height={H} className="block overflow-visible" role="img" aria-label={t('month.chartLabel')}>
        <defs>
          <linearGradient id="paid-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--pos)" stopOpacity="0.16" />
            <stop offset="1" stopColor="var(--pos)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).map((v) => (
          <g key={v}>
            <line x1={L} x2={w - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray={v ? '2 4' : undefined} />
            <text x={L - 10} y={y(v) + 4} textAnchor="end" fontSize="11.5" fill="var(--text-3)">
              {v ? compact(v, locale, currency) : '0'}
            </text>
          </g>
        ))}
        {ticks.map((d) => (
          <text key={d} x={x(d)} y={H - 4} textAnchor="middle" fontSize="11.5" fill="var(--text-3)">
            {new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${month}-${String(d).padStart(2, '0')}T00:00:00Z`))}
          </text>
        ))}
        <path d={area} fill="url(#paid-fill)" />
        <path d={path(series.paid)} fill="none" stroke="var(--pos)" strokeWidth="2" />
        <path d={path(series.projected)} fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="5 4" />
        <line x1={x(series.today)} x2={x(series.today)} y1={T - 8} y2={H - B} stroke="var(--text-3)" strokeDasharray="2 3" />
        <text x={x(series.today) + 6} y={H - B - 6} fontSize="11.5" fill="var(--text-3)">
          {t('month.today')}
        </text>
        {series.markers.map((m, i) => (
          <circle key={i} cx={x(m.day)} cy={y(m.cumMinor)} r="3" fill="var(--card)" stroke={m.state === 'paid' ? 'var(--pos)' : m.state === 'overdue' ? 'var(--neg)' : 'var(--accent)'} strokeWidth="2" />
        ))}
      </svg>
      {series.markers.map((m, i) => {
        const s = byId.get(m.subscriptionId);
        if (!s) return null;
        // Several logos on one day stack upwards.
        const stack = series.markers.slice(0, i).filter((o) => o.day === m.day).length;
        return (
          <div
            key={i}
            className="absolute rounded-full bg-card p-[2px]"
            style={{ left: x(m.day) - r - 2, top: y(m.cumMinor) - 2 * r - 10 - stack * (2 * r + 2), boxShadow: m.state === 'overdue' ? '0 0 0 1.5px var(--neg)' : '0 0 0 1px var(--line-2)' }}
            title={s.name}
          >
            <Logo sub={s} size={2 * r} />
          </div>
        );
      })}
    </div>
  );
}

function niceStep(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
