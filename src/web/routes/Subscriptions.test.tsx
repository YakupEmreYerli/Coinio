import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../i18n';
import { mockApi, renderApp, setViewport, sub } from '../test/render';
import { Subscriptions } from './Subscriptions';

const settings = { baseCurrency: 'TRY', timezone: 'Europe/Istanbul', locale: 'tr', reminderTime: '09:00', telegramBotToken: null, telegramChatId: null };
const summary = { base: 'TRY', leftThisMonthMinor: 0, monthlyAverageMinor: 0, yearlyTotalMinor: 0, upcoming: [], overdue: [], paidThisMonth: [], unconvertible: [], ratesStale: false, rates: { USD: 43.4 } };
const three = [
  sub({ id: 1, name: 'Netflix', category: 'Eğlence' }),
  sub({ id: 2, name: 'iCloud+', category: 'Altyapı', domain: 'icloud.com' }),
  sub({ id: 3, name: 'Claude Max', category: 'Yapay zekâ', autoPay: false }),
];

function page(route = '/subscriptions') {
  return renderApp(
    <Routes>
      <Route path="/subscriptions/:id?" element={<Subscriptions />} />
    </Routes>,
    { route },
  );
}
const names = () => screen.getAllByTestId('sub-row').map((r) => within(r).getByTestId('sub-name').textContent);

beforeEach(() => {
  setLocale('tr');
  setViewport(1440);
});
afterEach(() => vi.unstubAllGlobals());

describe('Subscriptions page', () => {
  it('subscriptions page empty state', async () => {
    mockApi({ 'GET /api/settings': settings, 'GET /api/summary': summary, 'GET /api/subscriptions': [] });
    page();
    expect(await screen.findByText(/henüz abonelik yok/i)).toBeInTheDocument();
  });

  it('search filters by name case-insensitively in tr', async () => {
    mockApi({ 'GET /api/settings': settings, 'GET /api/summary': summary, 'GET /api/subscriptions': three });
    page();
    await screen.findAllByTestId('sub-row');
    await userEvent.setup().type(screen.getByRole('searchbox'), 'İCLOUD');
    expect(names()).toEqual(['iCloud+']);
  });

  it('category query param filters', async () => {
    mockApi({ 'GET /api/settings': settings, 'GET /api/summary': summary, 'GET /api/subscriptions': three });
    page('/subscriptions?category=Yapay%20zek%C3%A2');
    await screen.findAllByTestId('sub-row');
    expect(names()).toEqual(['Claude Max']);
  });

  it('detail sheet shows payment history with skipped label', async () => {
    mockApi({
      'GET /api/settings': settings,
      'GET /api/summary': summary,
      'GET /api/subscriptions': three,
      'GET /api/subscriptions/3': three[2],
      'GET /api/payments': [
        { id: 7, subscriptionId: 3, dueDate: '2026-10-09', paidAt: '2026-10-09T10:00:00Z', amountMinor: 0, currency: 'TRY', actualBaseMinor: null, source: 'manual', status: 'skipped' },
        { id: 6, subscriptionId: 3, dueDate: '2026-09-09', paidAt: '2026-09-09T10:00:00Z', amountMinor: 19999, currency: 'TRY', actualBaseMinor: null, source: 'manual', status: 'paid' },
      ],
    });
    page('/subscriptions/3');
    const sheet = await screen.findByRole('dialog', { name: /claude max/i });
    expect(await within(sheet).findByText(/atlandı/i)).toBeInTheDocument();
  });

  it('inline actual amount edit sends PATCH', async () => {
    const calls = mockApi({
      'GET /api/settings': settings,
      'GET /api/summary': summary,
      'GET /api/subscriptions': [sub({ id: 3, name: 'Claude Max', currency: 'USD', amountMinor: 10000 })],
      'GET /api/subscriptions/3': sub({ id: 3, name: 'Claude Max', currency: 'USD', amountMinor: 10000 }),
      'GET /api/payments': [{ id: 6, subscriptionId: 3, dueDate: '2026-11-09', paidAt: '2026-11-09T10:00:00Z', amountMinor: 10000, currency: 'USD', actualBaseMinor: null, source: 'manual', status: 'paid' }],
      'PATCH /api/payments/6': { id: 6 },
    });
    page('/subscriptions/3');
    const user = userEvent.setup();
    const sheet = await screen.findByRole('dialog', { name: /claude max/i });
    await user.click(await within(sheet).findByRole('button', { name: /çekilen tutar/i }));
    await user.type(within(sheet).getByRole('textbox', { name: /çekilen tutar/i }), '4338{Enter}');
    await vi.waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ actualBaseMinor: 433800 }));
  });

  it('bulk pause updates all selected', async () => {
    const calls = mockApi({ 'GET /api/settings': settings, 'GET /api/summary': summary, 'GET /api/subscriptions': three, 'PATCH /api/subscriptions/1': three[0], 'PATCH /api/subscriptions/2': three[1] });
    page();
    const user = userEvent.setup();
    await screen.findAllByTestId('sub-row');
    await user.click(screen.getByRole('checkbox', { name: /netflix seç/i }));
    await user.click(screen.getByRole('checkbox', { name: /icloud\+ seç/i }));
    await user.click(screen.getByRole('button', { name: /^duraklat$/i }));
    await vi.waitFor(() => expect(calls.filter((c) => c.method === 'PATCH').map((c) => [c.url, c.body])).toEqual([
      ['/api/subscriptions/1', { active: false }],
      ['/api/subscriptions/2', { active: false }],
    ]));
  });
});
