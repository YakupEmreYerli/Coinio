import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../i18n';
import { mockApi, renderApp } from '../test/render';
import { SampleBanner, Welcome } from './Welcome';

const settings = { baseCurrency: 'TRY', timezone: 'Europe/Istanbul', locale: 'tr', reminderTime: '09:00', telegramBotToken: null, telegramChatId: null };

beforeEach(() => setLocale('tr'));
afterEach(() => vi.unstubAllGlobals());

describe('Welcome wizard', () => {
  it('wizard saves currency and locale', async () => {
    const calls = mockApi({ 'GET /api/settings': settings, 'PATCH /api/settings': settings, 'POST /api/onboarding/complete': undefined });
    renderApp(<Welcome onDone={() => {}} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: 'English' }));
    await user.click(screen.getByRole('button', { name: /continue|devam/i }));
    await user.click(await screen.findByRole('combobox', { name: /main currency|ana para birimi/i }));
    await user.click(await screen.findByRole('option', { name: 'USD' }));
    await user.click(screen.getByRole('button', { name: /continue|devam/i }));
    await vi.waitFor(() => expect(calls.filter((c) => c.method === 'PATCH').map((c) => c.body)).toContainEqual(expect.objectContaining({ baseCurrency: 'USD', locale: 'en' })));
  });

  it('sample choice creates samples and finishes', async () => {
    const calls = mockApi({ 'GET /api/settings': settings, 'PATCH /api/settings': settings, 'POST /api/onboarding/samples': { ids: [1] }, 'POST /api/onboarding/complete': undefined });
    const onDone = vi.fn();
    renderApp(<Welcome onDone={onDone} initialStep={2} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: /örnek verilerle dene/i }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(expect.arrayContaining(['POST /api/onboarding/samples', 'POST /api/onboarding/complete']));
  });

  it('skip completes onboarding', async () => {
    const calls = mockApi({ 'GET /api/settings': settings, 'POST /api/onboarding/complete': undefined });
    const onDone = vi.fn();
    renderApp(<Welcome onDone={onDone} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: /atla/i }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(calls.some((c) => c.method === 'POST' && c.url === '/api/onboarding/complete')).toBe(true);
  });

  it('banner clears samples', async () => {
    const calls = mockApi({ 'GET /api/onboarding': { completed: true, hasSamples: true } });
    renderApp(<SampleBanner />);
    await userEvent.setup().click(await screen.findByRole('button', { name: /örnekleri temizle/i }));
    await vi.waitFor(() => expect(calls).toContainEqual(expect.objectContaining({ method: 'DELETE', url: '/api/onboarding/samples' })));
  });
});
