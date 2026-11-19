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
  it('clicking a day opens its payments', async () => {
    const calls = mockApi({
      'GET /api/subscriptions': [sub({ nextDue: '2026-12-22', autoPay: false })],
      'GET /api/settings': settings,
      'GET /api/summary': summary,
      'POST /api/subscriptions/1/pay': { id: 5, subscriptionId: 1, dueDate: '2026-12-22' },
    });
    page('/calendar?month=2026-12');
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: /december 22/i }));
    const panel = await screen.findByRole('dialog');
    expect(within(panel).getByText('Netflix')).toBeInTheDocument();
    await u.click(within(panel).getByRole('button', { name: /^paid$/i }));
    expect(calls.some((c) => c.method === 'POST' && c.url === '/api/subscriptions/1/pay' && (c.body as { dueDate: string }).dueDate === '2026-12-22')).toBe(true);
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

  it('phone shows a list of days with payments', async () => {
    setViewport(390);
    mockApi({
      'GET /api/subscriptions': [sub({ nextDue: '2026-12-22' }), sub({ id: 2, name: 'Claude', nextDue: '2026-12-05', anchorDay: 5 })],
      'GET /api/settings': settings,
      'GET /api/summary': summary,
    });
    page('/calendar?month=2026-12');
    const list = await screen.findByRole('list', { name: /payments this month/i });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((i) => i.textContent)).toEqual([expect.stringContaining('Claude'), expect.stringContaining('Netflix')]);
  });
});
