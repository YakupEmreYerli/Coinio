import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../../i18n';
import { mockApi, renderApp, sub } from '../../test/render';
import { Activity } from './Activity';
import { AllSubscriptions } from './AllSubscriptions';
import { Distribution } from './Distribution';
import { QuickAdd } from './QuickAdd';
import { WeekStrip } from './WeekStrip';

const settings = { baseCurrency: 'TRY', timezone: 'Europe/Istanbul', locale: 'tr', reminderTime: '09:00', telegramBotToken: null, telegramChatId: null };
const summary = (over: Record<string, unknown> = {}) => ({
  base: 'TRY', leftThisMonthMinor: 0, monthlyAverageMinor: 0, yearlyTotalMinor: 0, upcoming: [], overdue: [], paidThisMonth: [], unconvertible: [], ratesStale: false, rates: { USD: 43.4 }, ...over,
});
const due = (over: Record<string, unknown>) => ({
  subscriptionId: 1, name: 'Netflix', logoPath: null, dueDate: '2026-11-22', daysLeft: 3, amountMinor: 19999, currency: 'TRY', baseMinor: 19999, autoPay: true, variableAmount: false, reminderDays: 1, ...over,
});

beforeEach(() => {
  setLocale('tr');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-19T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('dashboard cards', () => {
  it('quick add creates subscription with today as next due', async () => {
    const calls = mockApi({
      'GET /api/settings': settings,
      'GET /api/logos/candidates': { candidates: [{ id: 'brand:spotify', kind: 'brand', label: 'Spotify', previewUrl: '/x.svg?style=filled', size: null }] },
      'POST /api/subscriptions': sub({ id: 12, name: 'Spotify' }),
      'POST /api/subscriptions/12/logo/select': sub({ id: 12 }),
    });
    renderApp(<QuickAdd />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(screen.getByLabelText(/ad ya da site/i), 'spotify.com');
    await user.type(screen.getByLabelText(/tutar/i), '99,99');
    await screen.findByRole('button', { name: /spotify ekle/i });
    await user.click(screen.getByRole('button', { name: /spotify ekle/i }));
    await vi.waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url === '/api/subscriptions')).toBeTruthy());
    expect(calls.find((c) => c.url === '/api/subscriptions')!.body).toMatchObject({ name: 'Spotify', domain: 'spotify.com', amountMinor: 9999, nextDue: '2026-11-19', cycle: 'monthly' });
    await vi.waitFor(() => expect(calls.some((c) => c.url === '/api/subscriptions/12/logo/select')).toBe(true));
  });

  it('quick add fills website and category from the catalog for a known name', async () => {
    const calls = mockApi({ 'GET /api/settings': settings, 'GET /api/logos/candidates': { candidates: [] }, 'POST /api/subscriptions': sub({ id: 13, name: 'Netflix' }) });
    renderApp(<QuickAdd />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(screen.getByLabelText(/ad ya da site/i), 'netflix');
    await user.type(screen.getByLabelText(/tutar/i), '229,99');
    await user.click(screen.getByRole('button', { name: /netflix ekle/i }));
    await vi.waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url === '/api/subscriptions')?.body).toMatchObject({ name: 'Netflix', domain: 'netflix.com', category: 'Dizi ve film' }));
  });

  it('week strip places payments on correct weekday', async () => {
    mockApi({ 'GET /api/settings': settings, 'GET /api/summary': summary({ upcoming: [due({})] }), 'GET /api/subscriptions': [sub()] });
    renderApp(<WeekStrip />);
    const sunday = await screen.findByRole('listitem', { name: /22/ });
    expect(await within(sunday).findByText(/200/)).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: /19/ })).toHaveAttribute('aria-current', 'date');
  });

  it('distribution percentages sum to 100', async () => {
    mockApi({
      'GET /api/settings': settings,
      'GET /api/summary': summary(),
      'GET /api/subscriptions': [sub({ id: 1, category: 'A', amountMinor: 10000 }), sub({ id: 2, category: 'B', amountMinor: 5000 }), sub({ id: 3, category: 'B', amountMinor: 15000 }), sub({ id: 4, category: null, amountMinor: 3333 })],
    });
    renderApp(<Distribution />);
    const items = within(await screen.findByRole('list', { name: /aylık dağılım/i })).getAllByRole('listitem');
    const pct = items.map((li) => Number(/%(\d+)/.exec(li.textContent ?? '')![1]));
    expect(pct.reduce((a, b) => a + b, 0)).toBe(100);
    expect(items[0]).toHaveTextContent('B');
  });

  it('distribution notes subscriptions it could not convert', async () => {
    mockApi({ 'GET /api/settings': settings, 'GET /api/summary': summary({ unconvertible: [9] }), 'GET /api/subscriptions': [sub({ category: 'A' }), sub({ id: 9, currency: 'GBP', category: 'B' })] });
    renderApp(<Distribution />);
    expect(await screen.findByText(/1 abonelik toplama girmedi/i)).toBeInTheDocument();
  });

  it('activity undo calls DELETE', async () => {
    const calls = mockApi({
      'GET /api/settings': settings,
      'GET /api/subscriptions': [sub()],
      'GET /api/payments': [{ id: 31, subscriptionId: 1, dueDate: '2026-11-15', paidAt: '2026-11-15T09:00:00Z', amountMinor: 19999, currency: 'TRY', actualBaseMinor: null, source: 'auto', status: 'paid' }],
    });
    renderApp(<Activity />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(await screen.findByRole('button', { name: /geri al/i }));
    await vi.waitFor(() => expect(calls).toContainEqual(expect.objectContaining({ method: 'DELETE', url: '/api/payments/31' })));
  });

  it('all subscriptions sorts by monthly cost', async () => {
    mockApi({
      'GET /api/settings': settings,
      'GET /api/summary': summary(),
      'GET /api/subscriptions': [
        sub({ id: 1, name: 'Cheap', amountMinor: 1000 }),
        sub({ id: 2, name: 'Yearly', amountMinor: 120000, cycle: 'yearly' }),
        sub({ id: 3, name: 'Dollar', amountMinor: 2000, currency: 'USD' }),
      ],
    });
    renderApp(<AllSubscriptions />);
    const tiles = await screen.findAllByRole('link');
    expect(tiles.map((t) => t.textContent)).toEqual([expect.stringContaining('Dollar'), expect.stringContaining('Yearly'), expect.stringContaining('Cheap')]);
  });
});
