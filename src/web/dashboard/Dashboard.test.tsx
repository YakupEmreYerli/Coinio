import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APPEARANCE } from '../../shared/appearance';
import { setLocale } from '../i18n';
import { AppearanceProvider } from '../lib/appearanceContext';
import { Dashboard } from '../routes/Dashboard';
import { mockApi, renderApp, sub } from '../test/render';

const due = (over: Record<string, unknown>) => ({
  subscriptionId: 1, name: 'Netflix', logoPath: null, dueDate: '2026-11-22', daysLeft: 3, amountMinor: 19999, currency: 'TRY', baseMinor: 19999,
  autoPay: true, variableAmount: false, reminderDays: 1, ...over,
});
const summary = (over: Record<string, unknown> = {}) => ({
  base: 'TRY', leftThisMonthMinor: 0, monthlyAverageMinor: 0, yearlyTotalMinor: 0, upcoming: [], overdue: [], paidThisMonth: [], unconvertible: [], ratesStale: false, ...over,
});
const settings = { baseCurrency: 'TRY', timezone: 'Europe/Istanbul', locale: 'tr', reminderTime: '09:00', telegramBotToken: null, telegramChatId: null };

function routes(extra: Record<string, unknown> = {}) {
  return { 'GET /api/settings': settings, 'GET /api/reports': { base: 'TRY', months: [], byCategory: [], top: [], foreignShare: { minor: 0, percent: 0 } }, ...extra };
}

function show(appearance = DEFAULT_APPEARANCE) {
  return renderApp(
    <AppearanceProvider value={appearance}>
      <Dashboard />
    </AppearanceProvider>,
  );
}

beforeEach(() => {
  setLocale('tr');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-19T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Dashboard', () => {
  it('renders empty state for every dashboard card', async () => {
    mockApi(routes({ 'GET /api/summary': summary(), 'GET /api/subscriptions': [] }));
    show();
    expect(await screen.findByText('İlk aboneliğini ekle')).toBeInTheDocument();
    expect(screen.getByText(/yaklaşan ödeme yok/i)).toBeInTheDocument();
  });

  it('overdue row is first and has Paid button; auto row shows auto label', async () => {
    mockApi(routes({
      'GET /api/summary': summary({
        overdue: [due({ subscriptionId: 2, name: 'Hetzner', dueDate: '2026-11-17', daysLeft: -2, autoPay: false, baseMinor: 125000, amountMinor: 125000 })],
        upcoming: [due({})],
      }),
      'GET /api/subscriptions': [sub(), sub({ id: 2, name: 'Hetzner', autoPay: false, category: 'Altyapı' })],
    }));
    show();
    const list = await screen.findByRole('list', { name: /yaklaşan ödemeler/i });
    const rows = await within(list).findAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Hetzner');
    expect(rows[0]).toHaveTextContent(/2 gün gecikti/);
    expect(within(rows[0]!).getByRole('button', { name: /^ödendi$/i })).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent(/otomatik/i);
  });

  it('variable amount opens PayDialog', async () => {
    const calls = mockApi(routes({
      'GET /api/summary': summary({ upcoming: [due({ autoPay: false, variableAmount: true, name: 'Elektrik' })] }),
      'GET /api/subscriptions': [sub({ name: 'Elektrik', autoPay: false, variableAmount: true })],
      'POST /api/subscriptions/1/pay': { id: 5 },
    }));
    show();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(await screen.findByRole('button', { name: /^ödendi$/i }));
    const dialog = await screen.findByRole('dialog');
    await user.clear(within(dialog).getByLabelText(/ödenen tutar/i));
    await user.type(within(dialog).getByLabelText(/ödenen tutar/i), '250,40');
    await user.click(within(dialog).getByRole('button', { name: /ödendi olarak işaretle/i }));
    await vi.waitFor(() => expect(calls.find((c) => c.url === '/api/subscriptions/1/pay')?.body).toMatchObject({ amountMinor: 25040 }));
  });

  it('skip calls /skip and shows undo', async () => {
    const calls = mockApi(routes({
      'GET /api/summary': summary({ upcoming: [due({})] }),
      'GET /api/subscriptions': [sub()],
      'POST /api/subscriptions/1/skip': { id: 9 },
    }));
    show();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(await screen.findByRole('button', { name: /netflix: diğer işlemler/i }));
    await user.click(await screen.findByRole('menuitem', { name: /bu dönemi atla/i }));
    await vi.waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === '/api/subscriptions/1/skip')).toBe(true));
    // sonner keeps toasts from earlier tests in this file, so there may be more than one
    expect((await screen.findAllByRole('button', { name: /geri al/i })).length).toBeGreaterThan(0);
  });

  it('marks unconvertible items and stale rates', async () => {
    mockApi(routes({
      'GET /api/summary': summary({ ratesStale: true, unconvertible: [1], upcoming: [due({ currency: 'USD', amountMinor: 2000, baseMinor: null })] }),
      'GET /api/subscriptions': [sub({ currency: 'USD', amountMinor: 2000 })],
    }));
    show();
    expect((await screen.findAllByText(/^kur yok$/i)).length).toBe(1);
    expect(screen.getByText(/kurlar güncel değil/i)).toBeInTheDocument();
    // The totals say what they leave out.
    expect(screen.getAllByText(/1 abonelik toplama girmedi/i).length).toBeGreaterThan(0);
  });

  it('hidden card in appearance is not rendered', async () => {
    mockApi(routes({ 'GET /api/summary': summary({ upcoming: [due({})] }), 'GET /api/subscriptions': [sub()] }));
    show({ ...DEFAULT_APPEARANCE, cards: DEFAULT_APPEARANCE.cards.map((c) => (c.id === 'upcoming' ? { ...c, visible: false } : c)) });
    expect(await screen.findByText(/bu ay kalan/i)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /yaklaşan ödemeler/i })).not.toBeInTheDocument();
  });
});
