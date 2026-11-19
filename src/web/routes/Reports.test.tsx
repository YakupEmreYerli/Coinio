import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../i18n';
import { mockApi, renderApp, setViewport, sub } from '../test/render';
import { Reports } from './Reports';

const months = (fill: (i: number) => { paidMinor: number; projectedMinor: number }) =>
  Array.from({ length: 25 }, (_, i) => {
    const idx = 2025 * 12 + 10 + i; // 2025-11 … 2027-11
    return { month: `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`, ...fill(i) };
  });

beforeEach(() => {
  setLocale('en');
  setViewport(1440);
});
afterEach(() => vi.unstubAllGlobals());

describe('Reports', () => {
  it('renders 25 bars', async () => {
    mockApi({
      'GET /api/subscriptions': [sub(), sub({ id: 2, name: 'Claude', currency: 'USD', category: 'AI' })],
      'GET /api/reports': {
        base: 'TRY',
        months: months((i) => ({ paidMinor: i <= 12 ? 100000 + i : 0, projectedMinor: i >= 12 ? 90000 : 0 })),
        byCategory: [{ category: 'AI', monthlyMinor: 425000 }, { category: 'Eğlence', monthlyMinor: 19999 }],
        top: [{ subscriptionId: 2, name: 'Claude', monthlyMinor: 425000 }, { subscriptionId: 1, name: 'Netflix', monthlyMinor: 19999 }],
        foreignShare: { minor: 425000, percent: 95.5 },
      },
    });
    renderApp(<Reports />, { route: '/reports' });
    const chart = await screen.findByRole('list', { name: /monthly spending/i });
    const bars = within(chart).getAllByRole('listitem');
    expect(bars).toHaveLength(25);
    expect(bars[12]).toHaveAttribute('aria-current', 'date');
    const top = screen.getByRole('list', { name: /most expensive/i });
    expect(within(top).getAllByRole('listitem').map((li) => li.textContent)).toEqual([expect.stringContaining('Claude'), expect.stringContaining('Netflix')]);
    expect(screen.getByText('95.5%')).toBeInTheDocument();
  });

  it('empty report shows empty state', async () => {
    mockApi({
      'GET /api/subscriptions': [],
      'GET /api/reports': { base: 'TRY', months: months(() => ({ paidMinor: 0, projectedMinor: 0 })), byCategory: [], top: [], foreignShare: { minor: 0, percent: 0 } },
    });
    renderApp(<Reports />, { route: '/reports' });
    expect(await screen.findByText(/nothing to report yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /monthly spending/i })).not.toBeInTheDocument();
  });

  it('says when subscriptions are left out for lack of a rate', async () => {
    mockApi({
      'GET /api/subscriptions': [sub()],
      'GET /api/reports': {
        base: 'TRY', months: months(() => ({ paidMinor: 0, projectedMinor: 19999 })), byCategory: [], top: [{ subscriptionId: 1, name: 'Netflix', monthlyMinor: 19999 }],
        foreignShare: { minor: 0, percent: 0 }, unconvertible: [7, 8], ratesStale: true,
      },
    });
    renderApp(<Reports />, { route: '/reports' });
    expect(await screen.findByText(/2 subscriptions not in the total/i)).toBeInTheDocument();
  });
});
