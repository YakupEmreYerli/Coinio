import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../i18n';
import { mockApi, renderApp, setViewport, sub } from '../test/render';
import { Calendar } from './Calendar';

const settings = { baseCurrency: 'TRY', timezone: 'Europe/Istanbul', locale: 'en' };
const summary = { base: 'TRY', rates: { USD: 42.5 }, ratesStale: false };

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}

function page(route: string) {
  return renderApp(
    <Routes>
      <Route path="/calendar" element={<><Calendar /><Where /></>} />
    </Routes>,
    { route },
  );
}

beforeEach(() => {
  setLocale('en');
  setViewport(1440);
});
afterEach(() => vi.unstubAllGlobals());

describe('Calendar', () => {
  it('clicking a day shows its payments in the side panel', async () => {
    const calls = mockApi({
      'GET /api/subscriptions': [sub({ nextDue: '2026-12-22', autoPay: false }), sub({ id: 2, name: 'Claude', nextDue: '2026-12-05', anchorDay: 5 })],
      'GET /api/settings': settings,
      'GET /api/summary': summary,
      'POST /api/subscriptions/1/pay': { id: 5, subscriptionId: 1, dueDate: '2026-12-22' },
    });
    page('/calendar?month=2026-12');
    const panel = await screen.findByRole('region', { name: /selected day/i });
    // Opens on the month's first payment day.
    expect(await within(panel).findByText('Claude')).toBeInTheDocument();
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: /december 22/i }));
    expect(within(panel).getByRole('heading', { name: /december 22/i })).toBeInTheDocument();
    expect(within(panel).getByText('Netflix')).toBeInTheDocument();
    expect(within(panel).queryByText('Claude')).not.toBeInTheDocument();
    await u.click(within(panel).getByRole('button', { name: /^paid$/i }));
    expect(calls.some((c) => c.method === 'POST' && c.url === '/api/subscriptions/1/pay' && (c.body as { dueDate: string }).dueDate === '2026-12-22')).toBe(true);
  });

  it('arrow keys move the selected day and cross into the next month', async () => {
    mockApi({ 'GET /api/subscriptions': [sub({ nextDue: '2026-12-31', anchorDay: 31 })], 'GET /api/settings': settings, 'GET /api/summary': summary });
    page('/calendar?month=2026-12');
    const day = await screen.findByRole('button', { name: /december 31/i });
    expect(day).toHaveAttribute('tabindex', '0');
    const u = userEvent.setup();
    day.focus();
    await u.keyboard('{ArrowLeft}');
    expect(screen.getByRole('button', { name: /december 30/i })).toHaveFocus();
    await u.keyboard('{ArrowRight}{ArrowRight}');
    expect(await screen.findByRole('heading', { name: 'January 2027' })).toBeInTheDocument();
    expect(screen.getByTestId('where').textContent).toBe('/calendar?month=2027-01');
    expect(screen.getByRole('button', { name: /january 1(?!\d)/i })).toHaveFocus();
  });

  it('marks today and shows the month summary', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-10T09:00:00Z'));
    mockApi({
      'GET /api/subscriptions': [sub({ nextDue: '2026-12-22' }), sub({ id: 2, name: 'Claude', nextDue: '2026-12-15', anchorDay: 15, amountMinor: 1000, currency: 'USD' })],
      'GET /api/settings': settings,
      'GET /api/summary': summary,
    });
    page('/calendar');
    const today = await screen.findByRole('button', { name: /december 10/i });
    expect(today).toHaveAttribute('aria-current', 'date');
    expect(screen.getByRole('button', { name: /december 11/i })).not.toHaveAttribute('aria-current');
    // Today has nothing due, so the panel opens on the next payment day.
    expect(within(screen.getByRole('region', { name: /selected day/i })).getByText('Claude')).toBeInTheDocument();
    expect(screen.getByText('2 payments')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('month query param navigates', async () => {
    mockApi({ 'GET /api/subscriptions': [], 'GET /api/settings': settings, 'GET /api/summary': summary });
    page('/calendar?month=2027-02');
    expect(await screen.findByRole('heading', { name: 'February 2027' })).toBeInTheDocument();
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: /next month/i }));
    expect(await screen.findByRole('heading', { name: 'March 2027' })).toBeInTheDocument();
    expect(screen.getByTestId('where').textContent).toBe('/calendar?month=2027-03');
    await u.click(screen.getByRole('button', { name: /previous month/i }));
    await u.click(screen.getByRole('button', { name: /previous month/i }));
    expect(await screen.findByRole('heading', { name: 'January 2027' })).toBeInTheDocument();
  });

  it('phone shows the month as an agenda grouped by week', async () => {
    setViewport(390);
    mockApi({
      'GET /api/subscriptions': [sub({ nextDue: '2026-12-22' }), sub({ id: 2, name: 'Claude', nextDue: '2026-12-05', anchorDay: 5 })],
      'GET /api/settings': settings,
      'GET /api/summary': summary,
    });
    page('/calendar?month=2026-12');
    const agenda = await screen.findByRole('region', { name: /payments this month/i });
    const items = within(agenda).getAllByRole('listitem');
    expect(items.map((i) => i.textContent)).toEqual([expect.stringContaining('Claude'), expect.stringContaining('Netflix')]);
    const u = userEvent.setup();
    await u.click(within(agenda).getByRole('button', { name: /december 22/i }));
    expect(within(await screen.findByRole('dialog')).getByText('Netflix')).toBeInTheDocument();
  });
});
