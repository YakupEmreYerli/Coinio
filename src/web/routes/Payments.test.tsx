import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportMenu } from '../components/ExportMenu';
import { setLocale } from '../i18n';
import { mockApi, renderApp, sub } from '../test/render';
import { Payments } from './Payments';

const settings = { baseCurrency: 'TRY', timezone: 'Europe/Istanbul', locale: 'tr', reminderTime: '09:00', telegramBotToken: null, telegramChatId: null };
const pay = (id: number, over: Record<string, unknown> = {}) => ({ id, subscriptionId: 1, dueDate: '2026-11-09', paidAt: '2026-11-09T09:00:00Z', amountMinor: 19999, currency: 'TRY', actualBaseMinor: null, source: 'manual', status: 'paid', ...over });

function Where() {
  return <span data-testid="where">{useLocation().search}</span>;
}
function page(route = '/payments') {
  return renderApp(
    <Routes>
      <Route path="/payments" element={<><Payments /><Where /></>} />
    </Routes>,
    { route },
  );
}

beforeEach(() => setLocale('tr'));
afterEach(() => vi.unstubAllGlobals());

describe('Payments page', () => {
  it('date range filter updates query and request', async () => {
    const calls = mockApi({ 'GET /api/settings': settings, 'GET /api/subscriptions': [sub()], 'GET /api/payments': [pay(1)] });
    page();
    const user = userEvent.setup();
    await screen.findByText('Netflix');
    await user.type(screen.getByLabelText(/başlangıç/i), '2026-11-01');
    expect(screen.getByTestId('where').textContent).toContain('from=2026-11-01');
    await vi.waitFor(() => expect(calls.some((c) => c.url.startsWith('/api/payments?') && c.url.includes('from=2026-11-01'))).toBe(true));
  });

  it('undo removes row', async () => {
    let list = [pay(1), pay(2, { dueDate: '2026-10-09' })];
    const calls = mockApi({
      'GET /api/settings': settings,
      'GET /api/subscriptions': [sub()],
      'GET /api/payments': () => list,
      'DELETE /api/payments/1': () => {
        list = list.filter((p) => p.id !== 1);
        return new Response(null, { status: 204 });
      },
    });
    page();
    const user = userEvent.setup();
    const rows = await screen.findAllByTestId('payment-row');
    expect(rows).toHaveLength(2);
    await user.click(within(rows[0]!).getByRole('button', { name: /geri al/i }));
    await vi.waitFor(() => expect(calls).toContainEqual(expect.objectContaining({ method: 'DELETE', url: '/api/payments/1' })));
    await vi.waitFor(() => expect(screen.getAllByTestId('payment-row')).toHaveLength(1));
  });

  it('export menu links point to export endpoint', async () => {
    mockApi({});
    renderApp(<ExportMenu />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /dışa aktar/i }));
    const links = await screen.findAllByRole('menuitem');
    const hrefs = links.map((l) => l.getAttribute('href'));
    expect(hrefs).toEqual([
      '/api/export?format=csv&what=subscriptions',
      '/api/export?format=json&what=subscriptions',
      '/api/export?format=csv&what=payments',
      '/api/export?format=json&what=payments',
    ]);
  });

  it('total converts foreign payments that have no real amount yet', async () => {
    mockApi({
      'GET /api/settings': settings,
      'GET /api/subscriptions': [sub()],
      'GET /api/summary': { base: 'TRY', leftThisMonthMinor: 0, monthlyAverageMinor: 0, yearlyTotalMinor: 0, upcoming: [], overdue: [], paidThisMonth: [], unconvertible: [], ratesStale: false, rates: { USD: 43.4 } },
      'GET /api/payments': [pay(1, { currency: 'USD', amountMinor: 2000 }), pay(2)],
    });
    page();
    const total = (await screen.findByText(/bu listede ödenen/i)).parentElement!;
    await vi.waitFor(() => expect(total.textContent).toContain('1.067,99'));
  });
});
