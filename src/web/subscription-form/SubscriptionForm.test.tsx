import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../i18n';
import { mockApi, renderApp, sub } from '../test/render';
import { SubscriptionForm } from './SubscriptionForm';

beforeEach(() => setLocale('tr'));
afterEach(() => vi.unstubAllGlobals());

const settings = { baseCurrency: 'TRY', timezone: 'Europe/Istanbul', locale: 'tr', reminderTime: '09:00', telegramBotToken: null, telegramChatId: null };

describe('SubscriptionForm', () => {
  it('form submits minor units and autoPay defaults true', async () => {
    const calls = mockApi({ 'GET /api/settings': settings, 'GET /api/logos/candidates': { candidates: [] }, 'POST /api/subscriptions': sub({ id: 9 }) });
    const onOpenChange = vi.fn();
    renderApp(<SubscriptionForm open onOpenChange={onOpenChange} />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/^ad$/i), 'Spotify');
    await user.type(screen.getByLabelText(/tutar/i), '99,99');
    await user.click(screen.getByRole('button', { name: /kaydet/i }));
    await vi.waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.url === '/api/subscriptions')).toBeTruthy());
    const body = calls.find((c) => c.url === '/api/subscriptions' && c.method === 'POST')!.body as Record<string, unknown>;
    expect(body).toMatchObject({ name: 'Spotify', amountMinor: 9999, currency: 'TRY', autoPay: true, cycle: 'monthly', intervalCount: 1 });
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('form shows validation error for empty name', async () => {
    const calls = mockApi({ 'GET /api/settings': settings, 'GET /api/logos/candidates': { candidates: [] } });
    renderApp(<SubscriptionForm open onOpenChange={() => {}} />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/tutar/i), '10');
    await user.click(screen.getByRole('button', { name: /kaydet/i }));
    expect(await screen.findByText(/ad gerekli/i)).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('editing prefills fields and PATCHes', async () => {
    const calls = mockApi({
      'GET /api/settings': settings,
      'GET /api/logos/candidates': { candidates: [] },
      'GET /api/subscriptions/1': sub({ amountMinor: 19999, category: 'Eğlence' }),
      'PATCH /api/subscriptions/1': sub(),
    });
    renderApp(<SubscriptionForm open onOpenChange={() => {}} editId={1} />);
    const user = userEvent.setup();
    expect(await screen.findByDisplayValue('Netflix')).toBeInTheDocument();
    expect(screen.getByLabelText(/tutar/i)).toHaveValue('199,99');
    await user.click(screen.getByRole('button', { name: /kaydet/i }));
    await vi.waitFor(() => expect(calls.some((c) => c.method === 'PATCH' && c.url === '/api/subscriptions/1')).toBe(true));
  });

  it('a yen subscription edits and saves whole yen', async () => {
    const calls = mockApi({
      'GET /api/settings': { ...settings, baseCurrency: 'JPY' },
      'GET /api/logos/candidates': { candidates: [] },
      'GET /api/subscriptions/1': sub({ amountMinor: 1490, currency: 'JPY' }),
      'PATCH /api/subscriptions/1': sub(),
    });
    renderApp(<SubscriptionForm open onOpenChange={() => {}} editId={1} />);
    const user = userEvent.setup();
    expect(await screen.findByDisplayValue('1490')).toBeInTheDocument();
    const amount = screen.getByLabelText(/tutar/i);
    expect(amount).toHaveAttribute('inputmode', 'numeric');
    await user.clear(amount);
    await user.type(amount, '1590,5');
    await user.click(screen.getByRole('button', { name: /kaydet/i }));
    expect(await screen.findByText('9999 gibi bir tutar yaz')).toBeInTheDocument();
    await user.clear(amount);
    await user.type(amount, '1.590');
    await user.click(screen.getByRole('button', { name: /kaydet/i }));
    await vi.waitFor(() => expect(calls.some((c) => c.method === 'PATCH' && c.url === '/api/subscriptions/1')).toBe(true));
    expect(calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({ amountMinor: 1590, currency: 'JPY' });
  });

  it('choosing a catalog suggestion fills name, website, category and cycle', async () => {
    mockApi({ 'GET /api/settings': settings, 'GET /api/logos/candidates': { candidates: [] } });
    renderApp(<SubscriptionForm open onOpenChange={() => {}} />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/^ad$/i), 'netf');
    await user.click(await screen.findByRole('option', { name: /netflix/i }));
    expect(screen.getByLabelText(/^ad$/i)).toHaveValue('Netflix');
    expect(screen.getByLabelText(/site adresi/i)).toHaveValue('netflix.com');
    expect(screen.getByLabelText(/kategori/i)).toHaveValue('Dizi ve film');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });
});
